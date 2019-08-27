TYPEDOC:= ./node_modules/.bin/typedoc

build:
	node build.js

clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

docs:
	$(TYPEDOC)
	cp CNAME docs/
	cp .nojekyll docs/

publish:
	tsc --removeComments
	npm publish
	tsc

run:
	tsc
	DEBUG=axios node index.js

update:
	rm -f package-lock.json
	ncu -u
	npm version $(shell date '+%y.%V.%u%H') --force --allow-same-version
	npm install
	tsc

.PHONY: build docs
