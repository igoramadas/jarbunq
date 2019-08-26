TYPEDOC:= ./node_modules/.bin/typedoc

docs:
	$(TYPEDOC)
	cp CNAME docs/
	cp .nojekyll docs/

clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

publish:
	tsc --removeComments
	npm publish
	tsc

update:
	rm -f package-lock.json
	ncu -u
	npm install
	tsc

run:
	tsc
	DEBUG=axios node index.js

.PHONY: docs
