# Security

AI Handout Studio is a tool you run on your own machine. There is no hosted
service and no account system; the app is a local web server you start
yourself (`ai-handout-studio open`, `pnpm dev`, ...).

## What "LAN" mode opens up

By default the server only listens on `127.0.0.1` (this machine). Passing
`--lan` (or enabling the `features.lan` setting) also lets other devices on
the same network reach it, so you can read a handout or a question sheet from
a phone. In LAN mode, a request that did not originate from this machine can
only read pages — it cannot save, delete, or trigger an agent run. Turn LAN
mode off (`--no-lan`, or the setting) when you don't need it.

## Reporting a vulnerability

Please report security issues through
[GitHub's private vulnerability reporting](https://github.com/GentaAmeku/ai-handout-studio/security/advisories/new)
rather than a public issue, so a fix can go out before the details are
public. Include what you found, how to reproduce it, and its impact if you
can.
