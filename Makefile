TYPEDOC:= ./node_modules/.bin/typedoc

build-settings-sample:
	./bacli.js build-settings-sample

clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -rf ./expressvue
	rm -f package-lock.json

docs:
	rm -rf ./docs/assets
	rm -rf ./docs/classes
	rm -rf ./docs/interfaces
	rm -rf ./docs/modules
	$(TYPEDOC) --disableOutputCheck
	cp CNAME docs/
	cp .nojekyll docs/

decrypt:
	./bacli.js decrypt

encrypt:
	./bacli.js encrypt

package:
	pkg -o ./bin/bunq-assistant -t linux .

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

.PHONY: docs package
