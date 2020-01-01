TYPEDOC:= ./node_modules/.bin/typedoc

build:
	rm -rf ./expressvue
	tsc

build-settings-sample:
	./jarbuncli.js build-settings-sample

certificate:
	openssl genrsa -out bunq.local.key 4096
	openssl req -new -x509 -key bunq.local.key -out bunq.local.crt -days 999 -subj /C=DE/L=Berlin/CN=bunq.local

clean:
	rm -rf ./lib
	rm -rf ./node_modules
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
	./jarbuncli.js decrypt

encrypt:
	./jarbuncli.js encrypt

publish:
	tsc --removeComments
	npm publish
	tsc

run:
	tsc
	DEBUG=axios node index.js

update:
	ncu -u
	npm version $(shell date '+%y.%V.%u%H') --force --allow-same-version --no-git-tag-version
	npm install
	tsc

pm2:
	git pull
	tsc
	pm2 restart jarbunq

.PHONY: docs package pm2
