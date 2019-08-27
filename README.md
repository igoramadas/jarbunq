# bunq Assistant (ALPHA VERSION)

The bunq Assistant is a Node.js based service to automate tasks on your bunq accounts. It's not ready for prime time yet, but a fully working version is expected soon (first or max second week of September).

**This is a personal "weekend-project", and NOT an official bunq software.**

## Features

- Transfer order value from the Main account to the Amazon Card account based on order confirmation emails
- Easily create your own set of email parsing rules and actions (like the Amazon auto transfer above)
- Auto save money for kilometers and elevation ridden on Strava, daily or weekly
- Transfers can be fully automated, or as draft (with approval needed by the owner)
- Everything is logged to the console by default, easily customized to log elsewhere
- File based JSON database

## Planned features

- Web frontend to manage and query options and payments

## Installing

Clone this repo:

    $ git clone git@github.com:igoramadas/bunq-assistant.git

## Settings

The bunq Assistant is using [setmeup](https://github.com/igoramadas/setmeup) to handle its settings, which are saved into a couple of files:

- **settings.json** General settings shared accross all environments
- **settings.development.json** Development and test settings only
- **settings.production.json** Production settings only
- **settings.private.json** Your private settings - this is where you'll make 99% of your customizations

Please note that the `settings.private.json` file is NOT synced to GIT. A `settings.private.json.sample` that you can use for reference will be provided soon on this repo.

## Running the server

Please make sure you have Node.js 10.0 or superior installed.

To run on your local machine you can do it via make:

    $ make run

Don't have make or prefer doing things manually? Then:

    $ tsc
    $ npm index.js

During startup the service will check for all the required settings and alert or error if something is missing.

## What? Why?

The idea came up once I decided to automate some of my bike related savings. I usually spare some money every month for the eventual replacement of chains, cassette, cables and other wear-prone parts. But it would be much cooler if I could do this automatically and based on my actual mileage, insead of a fixed month value :-)

Amazon emails came next. I have an Amazon credit card used exclusively on Amazon, so whenever I purchase something, it would be great if the order amount could be moved to an account dedicated for the credit card payments.

Please note that although this project is open-source and relatively simple to customize to your needs, I am not interested in making it a full-fledged platform for bunq automations. If that's you cup of tea, you can fork the project and make your own ultra-featured version :-)

And a big **thank you** to all the open-source warriors that are responsible for the libraries used by this project.

## Security

Security is a top priority on this project. Hell, we're dealing with money, and no one wants to wake up on a lovely sunny morning to realise his bank accounts have been leaking cash. So what do I do to make sure this won't happen?

- Your bunq credentials are not known to the service, as it uses OAuth2
- No storage of any kind of credentials or tokens (except the ones you provide yourself)
- No logging of credentials or tokens
- Regular security scans on the dependencies - mostly via `$ npm audit`

## Bugs or suggestions?

Post it on the [issue tracker](https://github.com/igoramadas/bunq-assistant/issues).
