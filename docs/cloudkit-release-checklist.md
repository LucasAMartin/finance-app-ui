# CloudKit Sync Release Checklist

Use this before shipping iCloud sync changes or promoting the CloudKit development schema to production.

## App Capabilities

- The iOS target needs CloudKit enabled for `iCloud.com.lucasmartin.financeapp`.
- The app needs CloudKit sharing enabled with `CKSharingSupported`.
- The app needs silent remote notifications:
  - `UIBackgroundModes` includes `remote-notification`.
  - Entitlements include `aps-environment`.
  - `app.json` keeps `expo-notifications` configured with `enableBackgroundRemoteNotifications`.

## Record Types

The Swift bridge writes one CloudKit record per sync domain object. These record types must exist in the development schema before promotion:

- `ledger`
- `ledgerMember`
- `transaction`
- `income`
- `category`
- `budget`
- `recurringRule`
- `bill`
- `attachment`

Every type also stores app sync metadata fields:

- `appSyncCreatedByUserId`
- `appSyncUpdatedByUserId`
- `appSyncCreatedAt`
- `appSyncUpdatedAt`
- `appSyncDeletedAt`

## Queryable Indexes

The app primarily syncs with zone change tokens, so most runtime sync does not require querying. Add these queryable/sortable indexes anyway so CloudKit Console debugging and future repair tools work:

- All record types: `recordName`, queryable.
- All record types: `appSyncUpdatedAt`, queryable and sortable.
- All record types: `appSyncDeletedAt`, queryable.
- `transaction`: `occurredAt`, queryable and sortable.
- `transaction`: `merchant`, queryable.
- `transaction`: `cat`, queryable.
- `transaction`: `type`, queryable.
- `income`: `receivedAt`, queryable and sortable.
- `budget`: `month`, queryable and sortable.
- `budget`: `group`, queryable.
- `budget`: `category`, queryable.
- `bill`: `dueDate`, queryable and sortable.
- `recurringRule`: `nextDueDate`, queryable and sortable.
- `ledgerMember`: `userId`, queryable.

CloudKit field names for app data match the sync field names in `src/sync/sqliteSyncStore.ts`.

## Production Promotion

1. Build and run a development build with iCloud sync enabled.
2. Create or edit at least one item from each major area: transaction, income, budget, bill, recurring rule, category, and profile/member metadata.
3. Confirm those record types and fields appear in CloudKit Console development.
4. Add the indexes above in CloudKit Console.
5. Wait for indexes to finish building.
6. Run the device-to-device sync QA below.
7. Promote the development schema to production only after the QA pass is clean.

## Device QA

- Fresh install one physical device and one simulator, enable iCloud, pull to refresh on both.
- Create a transaction on device A. Device B should receive it after foregrounding or using `Sync Now`.
- Edit the same transaction on device A. Device B should receive the edit.
- Delete the transaction on device A. Device B should hide it without duplicating rows.
- Put device A offline, edit a transaction, then edit the same transaction differently on device B while online. Bring device A online and sync both. Expected result: no crash, no duplicate row, newer `updatedAt` wins.
- Change currency on device A. Device B should update transaction rows, budget inline values, insights detail rows, and totals.
- Open Sharing, invite another Apple ID, accept the share, and verify the participant writes into the shared database route.
- Confirm Settings and Sharing show useful sync status: `Synced`, `Checking`, `Pending`, `Needs Attention`, `Paused`, or `Failed`.

## Operational Notes

- CloudKit remote notifications are hints, not guaranteed delivery. The app still runs sync on foreground and via manual `Sync Now`.
- The native module stores received CloudKit remote-change notifications until React Native consumes them.
- If the user changes iCloud accounts, the app pauses sync rather than writing a different iCloud identity into the existing ledger.
- Avoid adding local-only CloudKit routing fields to synced ledger metadata; `src/sync/sqliteSyncStore.ts` strips those before upload.
