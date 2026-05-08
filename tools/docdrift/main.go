// docdrift - staleness detector for the Velocity docs.
//
// Walks the Velocity framework's exported symbols (via Go AST), looks each
// one up in the doc page(s) it's mapped to, and reports anything missing.
// Run from velocity-docs root:
//
//	go run ./tools/docdrift \
//	    --velocity ../velocity \
//	    --mapping data/api-mapping.yaml \
//	    --docs    content/docs
//
// Exit code is 0 when everything is covered, 1 when drift is found.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// ─── Mapping file ─────────────────────────────────────────────────────────────

type mapping struct {
	Packages       map[string]pageList `yaml:"packages"`
	Ignored        []string            `yaml:"ignored"`
	ExemptSymbols  []string            `yaml:"exempt_symbols"`
}

// pageList accepts either a single string or a list of strings.
type pageList []string

func (p *pageList) UnmarshalYAML(node *yaml.Node) error {
	switch node.Kind {
	case yaml.ScalarNode:
		var s string
		if err := node.Decode(&s); err != nil {
			return err
		}
		*p = pageList{s}
		return nil
	case yaml.SequenceNode:
		var s []string
		if err := node.Decode(&s); err != nil {
			return err
		}
		*p = pageList(s)
		return nil
	}
	return fmt.Errorf("expected string or list at line %d", node.Line)
}

func loadMapping(path string) (*mapping, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read mapping: %w", err)
	}
	var m mapping
	if err := yaml.Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("parse mapping: %w", err)
	}
	return &m, nil
}

// ─── Symbol extraction ────────────────────────────────────────────────────────

// symbol is one exported identifier we want covered in the docs.
type symbol struct {
	Pkg     string // velocity-relative package path, e.g. "auth" or "auth/drivers/session"
	Name    string // identifier as it should appear in the docs (e.g. "NewManager", "Manager.Authenticate")
	Kind    string // "func", "method", "type", "const", "var"
	File    string // source file (relative to the package), for error messages
}

// fullName returns "<pkg>.<name>" - the form used in the exempt_symbols list.
func (s symbol) fullName() string { return s.Pkg + "." + s.Name }

// extractPackage parses every non-test .go file in dir and returns the
// exported symbols, attributing them to relPkg.
func extractPackage(dir, relPkg string) ([]symbol, error) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, func(fi fs.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, parser.SkipObjectResolution)
	if err != nil {
		return nil, err
	}

	var out []symbol
	for _, pkg := range pkgs {
		// skip the synthetic "main" / test-only packages - we want only the
		// importable package living in this directory
		if strings.HasSuffix(pkg.Name, "_test") {
			continue
		}
		for fname, file := range pkg.Files {
			rel := filepath.Base(fname)
			for _, decl := range file.Decls {
				switch d := decl.(type) {
				case *ast.FuncDecl:
					if !d.Name.IsExported() {
						continue
					}
					if d.Recv != nil && len(d.Recv.List) > 0 {
						// method - record as "Type.Method" so the docs can be
						// matched on either form ("Type.Method" or just "Method")
						recv := receiverTypeName(d.Recv.List[0].Type)
						if recv == "" || !ast.IsExported(recv) {
							continue
						}
						out = append(out, symbol{
							Pkg: relPkg, Name: recv + "." + d.Name.Name,
							Kind: "method", File: rel,
						})
					} else {
						out = append(out, symbol{
							Pkg: relPkg, Name: d.Name.Name,
							Kind: "func", File: rel,
						})
					}
				case *ast.GenDecl:
					for _, spec := range d.Specs {
						switch s := spec.(type) {
						case *ast.TypeSpec:
							if !s.Name.IsExported() {
								continue
							}
							out = append(out, symbol{
								Pkg: relPkg, Name: s.Name.Name,
								Kind: "type", File: rel,
							})
						case *ast.ValueSpec:
							for _, n := range s.Names {
								if !n.IsExported() {
									continue
								}
								kind := "var"
								if d.Tok == token.CONST {
									kind = "const"
								}
								out = append(out, symbol{
									Pkg: relPkg, Name: n.Name,
									Kind: kind, File: rel,
								})
							}
						}
					}
				}
			}
		}
	}
	return out, nil
}

func receiverTypeName(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return receiverTypeName(t.X)
	case *ast.IndexExpr: // generic receiver: Foo[T]
		return receiverTypeName(t.X)
	case *ast.IndexListExpr: // generic receiver: Foo[T, U]
		return receiverTypeName(t.X)
	}
	return ""
}

// walkPackages enumerates every directory under velocityRoot that contains a
// non-test .go file and returns its module-relative package path.
func walkPackages(velocityRoot string) ([]string, error) {
	var pkgs []string
	err := filepath.WalkDir(velocityRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			return nil
		}
		base := d.Name()
		// skip noise
		if base == "." || base == "" {
			return nil
		}
		if strings.HasPrefix(base, ".") || base == "node_modules" || base == "vendor" || base == "scripts" {
			return fs.SkipDir
		}
		// must contain at least one importable .go file
		entries, err := os.ReadDir(path)
		if err != nil {
			return err
		}
		hasGo := false
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".go") && !strings.HasSuffix(e.Name(), "_test.go") {
				hasGo = true
				break
			}
		}
		if !hasGo {
			return nil
		}
		rel, err := filepath.Rel(velocityRoot, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil // skip module root for now - root pkg gets folded into mapped sub-packages by intent
		}
		pkgs = append(pkgs, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(pkgs)
	return pkgs, nil
}

// ─── Docs lookup ──────────────────────────────────────────────────────────────

// loadDocs reads every page referenced by the mapping into memory once.
// Pages are stored as lowercased text so case-insensitive search is cheap;
// symbol matching itself stays case-sensitive (see symbolMentioned).
type docCorpus struct {
	pages map[string]string // path → file contents (raw, not lowercased)
}

func loadDocs(docsRoot string, m *mapping) (*docCorpus, error) {
	c := &docCorpus{pages: map[string]string{}}
	seen := map[string]bool{}
	for _, pages := range m.Packages {
		for _, p := range pages {
			if seen[p] {
				continue
			}
			seen[p] = true
			full := filepath.Join(docsRoot, p)
			b, err := os.ReadFile(full)
			if err != nil {
				return nil, fmt.Errorf("read docs page %s: %w", p, err)
			}
			c.pages[p] = string(b)
		}
	}
	return c, nil
}

// symbolMentioned returns true if any of the given pages contains a token
// matching the symbol name. Match is case-sensitive and bounded by non-word
// characters so "Get" doesn't match inside "Getting".
func (c *docCorpus) symbolMentioned(pages pageList, sym symbol) bool {
	// a method "Type.Method" matches if the docs contain either the dotted
	// form or the bare method name AND the receiver type somewhere on the page
	candidates := []string{sym.Name}
	if sym.Kind == "method" {
		parts := strings.SplitN(sym.Name, ".", 2)
		if len(parts) == 2 {
			candidates = []string{sym.Name, parts[1]}
		}
	}
	for _, page := range pages {
		body, ok := c.pages[page]
		if !ok {
			continue
		}
		for _, cand := range candidates {
			if hasWord(body, cand) {
				if sym.Kind == "method" {
					// if matching the bare method name, also require the receiver type
					// to appear *somewhere* in the page so we don't false-positive on
					// common verbs like "Get" or "New"
					parts := strings.SplitN(sym.Name, ".", 2)
					if cand != sym.Name && len(parts) == 2 && !hasWord(body, parts[0]) {
						continue
					}
				}
				return true
			}
		}
	}
	return false
}

var nonWord = regexp.MustCompile(`\w`)

// hasWord returns true if s contains needle as a whole word, where word
// boundaries are anything that isn't [A-Za-z0-9_].
func hasWord(s, needle string) bool {
	if needle == "" {
		return false
	}
	idx := 0
	for {
		i := strings.Index(s[idx:], needle)
		if i < 0 {
			return false
		}
		start := idx + i
		end := start + len(needle)
		// boundary check
		leftOK := start == 0 || !nonWord.MatchString(string(s[start-1]))
		rightOK := end == len(s) || !nonWord.MatchString(string(s[end]))
		if leftOK && rightOK {
			return true
		}
		idx = end
	}
}

// ─── Driver ───────────────────────────────────────────────────────────────────

type missing struct {
	Symbol  symbol   `json:"symbol"`
	Pages   pageList `json:"pages"`
}

type report struct {
	Mapped     int       `json:"mapped_packages"`
	Unmapped   []string  `json:"unmapped_packages"`
	Symbols    int       `json:"total_symbols"`
	Missing    []missing `json:"missing"`
	Exempted   int       `json:"exempted"`
}

func main() {
	var (
		velocityFlag = flag.String("velocity", "../velocity", "path to the velocity framework checkout")
		mappingFlag  = flag.String("mapping", "data/api-mapping.yaml", "path to api-mapping.yaml")
		docsFlag     = flag.String("docs", "content/docs", "path to the docs content root")
		jsonFlag     = flag.Bool("json", false, "emit a single JSON report instead of human text")
		strictFlag   = flag.Bool("strict", true, "exit non-zero when any drift is found")
		summaryFlag  = flag.Bool("summary", false, "show per-package counts only (no symbol list)")
		filterFlag   = flag.String("package", "", "only check this package (e.g. auth, orm); accepts top-level or full path")
	)
	flag.Parse()

	m, err := loadMapping(*mappingFlag)
	check(err)

	ignored := map[string]bool{}
	for _, ig := range m.Ignored {
		ignored[ig] = true
	}
	exempt := map[string]bool{}
	for _, e := range m.ExemptSymbols {
		exempt[e] = true
	}

	pkgs, err := walkPackages(*velocityFlag)
	check(err)

	corpus, err := loadDocs(*docsFlag, m)
	check(err)

	rep := report{}
	unmappedSet := map[string]bool{}

	for _, pkg := range pkgs {
		// skip private and ignored
		if strings.HasPrefix(pkg, "internal/") || pkg == "internal" {
			continue
		}
		top := strings.SplitN(pkg, "/", 2)[0]
		if ignored[top] {
			continue
		}
		if *filterFlag != "" && top != *filterFlag && pkg != *filterFlag {
			continue
		}
		// look up which pages cover this package - sub-packages inherit the
		// top-level package's mapping
		pages, mapped := m.Packages[pkg]
		if !mapped {
			pages, mapped = m.Packages[top]
		}
		if !mapped {
			unmappedSet[pkg] = true
			continue
		}

		dir := filepath.Join(*velocityFlag, pkg)
		syms, err := extractPackage(dir, pkg)
		if err != nil {
			fmt.Fprintf(os.Stderr, "warn: parse %s: %v\n", pkg, err)
			continue
		}
		rep.Mapped++
		rep.Symbols += len(syms)

		for _, s := range syms {
			if exempt[s.fullName()] {
				rep.Exempted++
				continue
			}
			if corpus.symbolMentioned(pages, s) {
				continue
			}
			rep.Missing = append(rep.Missing, missing{Symbol: s, Pages: pages})
		}
	}
	for u := range unmappedSet {
		rep.Unmapped = append(rep.Unmapped, u)
	}
	sort.Strings(rep.Unmapped)
	sort.Slice(rep.Missing, func(i, j int) bool {
		if rep.Missing[i].Symbol.Pkg != rep.Missing[j].Symbol.Pkg {
			return rep.Missing[i].Symbol.Pkg < rep.Missing[j].Symbol.Pkg
		}
		return rep.Missing[i].Symbol.Name < rep.Missing[j].Symbol.Name
	})

	if *jsonFlag {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		check(enc.Encode(rep))
	} else if *summaryFlag {
		printSummary(rep)
	} else {
		printText(rep)
	}

	if *strictFlag && (len(rep.Missing) > 0 || len(rep.Unmapped) > 0) {
		os.Exit(1)
	}
}

func printText(r report) {
	fmt.Printf("docdrift - %d packages, %d symbols, %d exempted\n",
		r.Mapped, r.Symbols, r.Exempted)

	if len(r.Unmapped) > 0 {
		fmt.Printf("\n%d unmapped package(s) (add to data/api-mapping.yaml or to `ignored:`):\n",
			len(r.Unmapped))
		for _, u := range r.Unmapped {
			fmt.Printf("  - %s\n", u)
		}
	}

	if len(r.Missing) == 0 {
		fmt.Println("\nNo missing symbols.")
		return
	}

	fmt.Printf("\n%d undocumented symbol(s):\n", len(r.Missing))
	currentPkg := ""
	for _, m := range r.Missing {
		if m.Symbol.Pkg != currentPkg {
			currentPkg = m.Symbol.Pkg
			fmt.Printf("\n  %s  →  %s\n", currentPkg, strings.Join(m.Pages, ", "))
		}
		fmt.Printf("    %-7s %s\n", m.Symbol.Kind, m.Symbol.Name)
	}
}

func printSummary(r report) {
	fmt.Printf("docdrift - %d packages, %d symbols, %d exempted, %d missing\n",
		r.Mapped, r.Symbols, r.Exempted, len(r.Missing))

	if len(r.Unmapped) > 0 {
		fmt.Printf("\nunmapped packages: %s\n", strings.Join(r.Unmapped, ", "))
	}

	if len(r.Missing) == 0 {
		return
	}

	// per-package counts
	counts := map[string]int{}
	for _, m := range r.Missing {
		counts[m.Symbol.Pkg]++
	}
	type row struct {
		pkg   string
		count int
	}
	var rows []row
	for k, v := range counts {
		rows = append(rows, row{k, v})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].count > rows[j].count })
	fmt.Println("\nmissing per package:")
	for _, r := range rows {
		fmt.Printf("  %4d  %s\n", r.count, r.pkg)
	}
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(2)
	}
}
