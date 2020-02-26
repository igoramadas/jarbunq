# Jarbunq

Jarbunq is a Node.js / TypeScript based service to automate tasks on your [bunq](https://bunq.endtrk.com/RWXLS6/225JFQ/?sourceId=jarbunq) account(s).

## Features

- Trigger actions on bunq accounts based on received emails:
    - Action: Generic - transfer fixed amount when email comes with the specified address, subject and/or body
    - Action: Amazon.de - transfer order values from the Main account to the Amazon account
    - Action: Amazon.de Refund - transfer Amazon refunds from the Amazon to the Main account
    - Action: LBB Credit Card - make sure the Amazon account has enough funds to pay the credit card bills
    - Action: Zalando.de - reserve amounts and schedule payments for Zalando.de invoices
- Eventhooks to automate payments and integrate with external systems (a mini IFTTT), examples:
    - Auto save a % of current balance to savings account when salary arrives
    - Forward rent payments from your flatmates to the owners account
    - Make a donation of 5 EUR each time you buy flight tickets
    - Forward failed card payments notifications to your security system
    - Etc etc etc, your imagination is the limit :-)
- Auto save money for kilometers and elevation ridden on Strava, daily or weekly
- Transfers can be fully automated, or as draft (with approval needed by the owner)
- Email and push notifications (via Pushover or similar)
- Easily add your own features via a plugins file / folder

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

## How stable is this?

I have it running myself on my own server since 1st of September 2019. No issues so far, and a bunch of automated payments processed successfully :-)

## I don't even know what bunq is...

Then head on to [bunq.com](https://bunq.endtrk.com/RWXLS6/225JFQ/?sourceId=jarbunq) and learn more. In a few words, the best banking experience you can have in Europe right now.

## Bugs or suggestions?

Post it on the [issue tracker](https://github.com/igoramadas/jarbunq/issues).
