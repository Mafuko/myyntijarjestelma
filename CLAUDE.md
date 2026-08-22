# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository currently contains only a requirements document: [Myyntijärjestelmä.pdf](Myyntijärjestelmä.pdf) (Finnish). No source code, build tooling, or tests exist yet. There is nothing to build, lint, or run — this section should be filled in with real commands once a codebase is scaffolded.

## Project overview

"Myyntijärjestelmä" (sales system) is a planned web application to replace a manual Google Sheets-based workflow for organizing flea-market ("pihakirppis") sales events. It appears to be built as a school/thesis project (opinnäytetyö).

Current manual process it replaces: sellers request to join via email → organizer copies a Google Sheets template and shares an edit link → seller fills in their items → organizer manually checks formatting, generates price tags via spreadsheet formulas, exports as PDF, and emails them back. This is manual, error-prone, and gives sellers/staff no real-time visibility into sales.

## Core requirements (from spec)

**Users & roles** (login required; role determines permissions):
- Fields: name, role, phone (required for Myyjä), email, payout preference (cash or bank transfer), IBAN (required if bank transfer)
- **Myyjä (Seller)**: lists/edits/deletes only their own items for sale; cannot see other sellers' lists
- **Työvoima (Staff)**: sees a combined view of all sellers' listed items across an event
- **Ylläpitäjä (Admin)**: full visibility and edit access to everything
- Open decision in the spec: whether role-based access is in scope for v1, or just supported at the data/backend level for later

**Events**: Organizer/admin creates events with a name, date, key registration deadlines, and a commission rate (default has historically been 10% of a seller's total revenue, but must be configurable per event; not needed if the organizer is the only seller).

**Item listing**: Sellers add items with name, price, category (dropdown), and an "K-18" (age-restricted, 18+) checkbox. Bulk/quick-entry should be supported since sellers often list many near-identical items (e.g. a manga series). Import from a Google Sheets file should be supported for initial bulk-add. Sellers can add/edit/delete their own items up to a configured cutoff date.

**Price tags**: Generated from item data, downloadable as PDF. Must show item name, price, and seller's alias/nickname, plus a K-18 indicator when applicable.

**Barcodes**: Each price tag gets a unique barcode for scanning at checkout. Below the barcode, a fallback text code must be enterable manually (functions identically to a scan) in case the scanner fails to read it. On successful scan/entry, the system looks up the item and shows a confirmation popup ("Selling item X, confirm sale?") that can be accepted via Enter key (no mouse required).

**Sales tracking (seller view)**: Once logged in, a seller can see real-time: which of their items have sold, which remain unsold, total revenue, and the commission amount owed (based on the event's configurable rate). This list also helps sellers reconcile and collect their unsold items after the event.

**UI**: Simple to start; dark mode is a stated preference.

**Forward compatibility**: Even features not needed for v1 (e.g. full role-based access) should be accounted for in the backend/data model so they can be added later without rearchitecting.

## Working with this repo

Since there is no code yet, treat any implementation work as greenfield: there are no existing conventions, frameworks, or architecture to follow. When a stack is chosen and code is added, update this file with actual build/lint/test commands and real architectural notes (how the frontend, backend, and data model fit together) — replace this placeholder guidance rather than layering onto it.
