# Transaction automation playbook

The app accepts transaction drafts through the `financeapp` URL scheme:

```text
financeapp:///expense?source=sms&text=<url-encoded alert text>
financeapp:///expense?source=wallet&amount=12.50&merchant=Lasang%20Pinoy&date=2026-06-29T12%3A00%3A00Z
```

Apple Pay and SMS imports can either auto-save in the background or open in review mode with amount, merchant, note, date, and category prefilled.

## SMS alert shortcut

In Settings, set Text Message Import to `Review first` for the first run, then create a Shortcuts personal automation with the Message trigger.

Preferred setup:

1. Tap `Create Automation` in the app, or open `shortcuts://create-automation`.
2. In `When`, choose the Message trigger.
3. Choose the bank, card issuer, or fraud-alert sender.
4. Add a phrase filter such as `purchase`, `spent`, `charge`, or `transaction`. Avoid `$` for the final setup because balance and payment reminder texts can also contain dollar amounts.
5. In `Do`, tap `Add Action`, open finance-app, then choose the action named `Process Receipt`.
6. Tap the blank text field inside `Process Receipt`, then choose `Shortcut Input`.
7. In `Automation`, choose Run Immediately and turn Notify When Run off.

The finished action should look like `Process receipt Shortcut Input`. This is the same shape used by receipt-processing Shortcuts flows such as Monetal's setup.
If Shortcuts opens an `Add Shortcut` screen or inserts a fieldless `Process Receipt` row, back out and add it from the automation `Add Action` screen instead.

After one preview works, switch Text Message Import to `Auto-save` for background logging.

If Shortcuts shows `Running your automation` but finance-app does not import anything, reopen Settings > Text Message Setup. The status panel records ignored runs and will show whether no receipt text reached the app or the text did not look like a card purchase alert.

Fallback URL setup if the native action is unavailable:

```text
financeapp:///expense?source=sms&text=<encoded message body>
```

Example alert:

```text
You made a purchase of $12.50 at SQ *LASANG PINOY with credit card ...7780.
```

Parsed draft:

```text
amount: 12.50
merchant: Lasang Pinoy
category: dining
cardLast4: 7780
```

In debug builds, the Text Message setup guide shows `Replay Last Import` after one text import has run. This stores the last replay payload in local settings only for development, then opens it in preview mode so parser and category changes can be tested repeatedly without waiting for another bank text. Release builds do not store this replay payload.

## Wallet transaction shortcut

In Settings, set Apple Pay Import to `Auto-save`, then create a Shortcuts personal automation with the Transaction trigger.

Preferred setup:

1. Tap `Create Automation` in the app, or open `shortcuts://create-automation`.
2. In `When`, add the Transaction trigger. On iOS 26+, this is labeled `Wallet`.
3. Select every payment card and every category you want tracked.
4. In `Do`, tap `Add Action`, open finance-app, then choose `Import Apple Pay Transaction`.
5. Tap the blank transaction field inside the app action, then choose `Shortcut Input`.
6. In `Automation`, choose Run Immediately and turn Notify When Run off.

The finished action should look like `Import Shortcut Input as Apple Pay transaction`. Amount, merchant, and date fields are still available as a fallback for iOS versions or Shortcuts builds that do not convert the transaction input cleanly.

In `Auto-save`, the native App Intent does not open the app. It writes directly to the app's SQLite ledger with `sync_status = pending`, so the transaction is already there the next time the app is opened. In `Review first`, the same action opens the prefilled expense screen instead.

The Apple Pay setup guide in Settings shows the last few Wallet imports. Use that section after a real tap-to-pay purchase to confirm that background logging is working without opening Activity.

If Apple Pay automations do not fire, check that mobile data is enabled for Wallet in iOS Settings.

In debug builds, the setup guide also shows `Replay Last Import` after one Wallet import has run. This stores the last replay payload in local settings only for development, then opens it in preview mode so parser and category changes can be tested repeatedly without another real payment. Release builds do not store this replay payload.

Fallback URL setup if the native action is unavailable:

```text
financeapp:///expense?source=wallet&amount=<amount>&merchant=<encoded merchant>&date=<encoded date>
```

If the shortcut only gives a text description, pass it through `text` instead:

```text
financeapp:///expense?source=wallet&text=<encoded transaction text>
```

## Implementation notes

- Direct Apple Pay/Wallet history import is not implemented because iOS does not expose a general third-party transaction-history reader.
- Direct SMS inbox scanning is not implemented. Use the Shortcuts Message trigger so the user explicitly controls which alerts are handed to the app.
- Raw SMS bodies are parsed in memory and are not stored on the transaction. Debug builds may keep the last raw text in local settings for replay testing; release builds do not. The transaction stores lightweight automation metadata such as source, confidence, and card last four when present.
- The native Apple Pay and Text Message actions store an automation fingerprint and still keep a five-minute duplicate fallback for matching amount, merchant, card last four, and timestamp.
- Background import depends on the finance-app SQLite database already existing, which happens once the user has opened Settings and enabled the import mode. If the database is unavailable, the action falls back to the review URL.

## Before App Store upload

- Add Apple Pay and SMS automation language to the privacy policy and App Review notes before submitting this feature. Call out that raw alert/transaction text is parsed locally, not stored, and that the user creates the Shortcuts automation explicitly.
- Real-device QA should include one auto-save purchase, one duplicate retry, one review-first run, Wallet mobile data disabled/enabled, and a fresh install where the database fallback opens review.
