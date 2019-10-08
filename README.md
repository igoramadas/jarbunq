# Jarbunq

Jarbunq is a Node.js / TypeScript based service to automate tasks on your bunq account(s).

**This is a personal "weekend-project", and NOT an official bunq software.**

## Features

- Trigger actions on bunq accounts based on received emails
    - Action: Generic - transfer fixed amount when email comes with the specified address, subject and/or body
    - Action: Amazon.de - transfer order values from the Main account to the Amazon account
    - Action: LBB Credit Card - make sure the Amazon account has enough funds to pay the credit card bills
- Auto save money for kilometers and elevation ridden on Strava, daily or weekly
- Transfers can be fully automated, or as draft (with approval needed by the owner)
- Everything logged to the console by default, easily customized to log elsewhere
- Email notifications of failed transactions
- Webhooks to integrate with other systems (ie. Home Assistant server, Philips Hue, etc)
- Easily add your own features via we a plugins file

### Planned features

- Web frontend to configure the settings and view status / logs (work in progress!)
- Support push or SMS notifications
- Support sending events to Philips Hue
- Support hot-reloading of settings and modules (no need to restart the service)
- Create a single app-package using [pkg](https://github.com/zeit/pkg)

## Crazy quick start guide

    $ git clone git@github.com:igoramadas/jarbunq.git
    $ make clean update
    $ cat settings.private.json.sample
    $ vim settings.private.json
    $ make certificate
    $ make run

Need help? Sure you do. Then follow these [detailed instructions](https://github.com/igoramadas/jarbunq/wiki/Downloading-the-code)...

## What for?

The idea came up once I decided to automate some of my bike related savings. I usually spare some money every month for the eventual replacement of chains, cassette, cables and other wear-prone parts. But it would be much cooler if I could do this automatically and based on my actual mileage, insead of a fixed monthly amount :-)

Amazon emails came next. I have an Amazon credit card used exclusively on Amazon, so whenever I purchase something, it would be great if the order amount could be moved to an account dedicated for the credit card payments.

Please note that although this project is open-source and relatively simple to customize to your needs, I am not interested in making it a full-fledged, cloud hosted platform for bunq automations. If that's you cup of tea, I suggest the great [bunq2IFTTT](https://github.com/woudt/bunq2ifttt/). *But I might change my mind, who knows...*

And a big **thank you** to all the open-source warriors that are responsible for the libraries used by this project.

## Why Jarbunq?

Total lack of creativity. Jarvis + bunq.
sure.
## How stable is this?

I have it running myself on my own server since 1st of September 2019. No issues so far, and a bunch of Amazon and Strava related payments processed successfully :-)

## Bugs or suggestions?

Post it on the [issue tracker](https://github.com/igoramadas/jarbunq/issues).
