---
layout: post
title: Bitcoin Name Server
category: posts
---

This project started as an idea I came with for the [Bitembassy hackathon](http://hack.bitembassy.org). The
morning of the hackathon, I couldn't find anyone to join me, so I ditched it and joined a different
project. Afterwards I started developing my idea, but it's still very minimal, writing everything in
a day or two.

The main idea is to have something similar to a PGP key server, but for bitcoin addresses. For
example, if a mobile wallet is integrated with this feature, than you could write "@GuySa" or any
other unique ID (email address, etc.) and it will automatically dereference it to my bitcoin
address.

The project is defined very loosely and is missing a lot. this is just a concept I might improve if
I have some free time. 

## Partial To-do list:
* no security measurements were taken into account. 
* think about authentication when submitting a new entry.
* add a DB that saves entries (right now it does nothing...).

you can find the source [on github][source code]

---

[source code]: https://github.com/GuySa/BitcoinNameServer
