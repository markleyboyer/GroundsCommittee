# Morningside Gardens Grounds Committee

Website for the Morningside Gardens Grounds Committee, served from `docs/` by GitHub Pages.

| Page | What it's for | Who can change it |
|---|---|---|
| Home (`docs/index.html`) | Next meeting, this month's committee items, open issue count | — |
| Minutes Schedule | Sign up to take minutes or be backup; see who has taken them so far | Members (own slot), admin (everything) |
| Minutes Archive | Download past minutes; upload new or old ones | Members |
| Issues | Ongoing issues with dated updates | Members |
| Committee Year | What comes before the committee each month | Admin |
| Bulbs | Supplier links, shared orders between Buildings 1–6, receipts for the treasurer | Members; treasurer marks reimbursed |
| Tree Map (`docs/trees/`) | Tree inventory map (public, no login) | — |
| Admin | Members, passwords, meetings, reminder settings | Admin |

Data, logins and files are stored in Firebase (Firestore, Auth, Storage). Email reminders and receipt notices come from Cloud Functions in `functions/`. Access rules are in `firestore.rules` and `storage.rules`.

See **[SETUP.md](SETUP.md)** for first-time setup.

The tree-map source data and scripts are in `scripts/`, `Topoexport/` and `treeidmapandtableattacheddocuments/`.
