.PHONY: build
build: dist

.PHONY: clean
clean:
	rm -rf dist

dist: node_modules
	npm run build

node_modules: package-lock.json
	npm install
	test -d node_modules && touch node_modules
