# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS without a build step (decided in the design doc), installable as a PWA. Served locally on `127.0.0.1:5190` and published on GitHub Pages. Data comes from JSON files on the `data` branch.

## Users

One person (Bruno), who travels only on weekends outside working hours, departing from Bari (BRI) or Brindisi (BDS). They check the app quickly, from a PC first and then from an iPhone.

## Product Purpose

Answer "where can I go this weekend, or in the next ones, spending as little as possible?" without choosing a destination first. The most important first view is **the best deals overall** across all 8 weekends; the weekend is a detail of each row. Success = open it and know in seconds whether there is a deal worth booking.

## Positioning

Shaped around one person's constraints: Friday departures from 18:00 or any time Saturday, Sunday return, ≤1 stop on a single ticket with layover ≤3 h, ≤200 € round trip, data refreshed every 15 minutes (direct flights) and every 4 hours (connections).

## Operating Context

- Quick, repeated checks during the week; Telegram alerts (<80 €) bring the user back to the app.
- From an alert or a row, the user goes to the airline or Google Flights site to book: the app does not book anything.

## Capabilities and Constraints

- Sources: Ryanair, Wizz Air (direct flights), Google Flights (connections and other airlines). Each source can fail independently: its status and data age must always be visible.
- Wizz arrival times are estimated.
- Prices are basic fares: small hand luggage only, 1 adult.
- Italian UI. No personal data, no accounts.

## Evidence on Hand

Real data in `data/direct.json` (generated locally) and, in production, on the `data` branch. No testimonials or claims to show.

## Product Principles

1. Price comes first: the cheapest deal is the first thing you see.
2. Always be honest about how fresh the data is.
3. Every row leads straight to booking.
4. Fast to read on a phone, at a glance.
