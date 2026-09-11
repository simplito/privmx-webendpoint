# Secure intake

Anyone with a link can send your team a message and a file that only the team can
open. No account, no login, and nothing readable in transit or at rest.

Built on **GroupApi alone** - no Thread, no Store, no Inbox, no Search. The only
other API in the code is `CryptoApi`, to generate your key.

```bash
scripts/example_bridge                  # from the repo root: a local Bridge
npm run build-package
cd example/secure-intake && npm install && npm run dev
```

## What the two panes show

**Left is you**, a member of the receiving Group. **Right is a sender** who has
the Group's id and public key and nothing else. Press *Open the intake box*,
then send something from the right.

- The sender's session comes from `connectPublic`. No user, no registered key.
  `encryptAnonymously` calls **no server**, so the Bridge never learns that a
  submission happened.
- What arrives is badged **anonymous**. `decrypt` reports `ENVELOPE_ANONYMOUS`
  and no author. Your own notes come back **signed**, with an author key the
  core checked. Branch on that type. A filled-in author field proves nothing.
- Files are sealed as a stream. *Download* reads every chunk in order, the only
  way to learn whether the file arrived whole. *Peek at 1 MiB* seeks instead: it
  fetches 262 144 of 2 097 936 bytes, skips the rest, and gives up that check.
- Keep the envelope next to the ciphertext. It names the Group, the key version,
  the author and the size. Without it nobody opens the file, including members.

## The storage is not PrivMX

`src/store.ts` is a `Map` standing in for your S3 bucket, and the panel at the
bottom shows everything it can see.

Every envelope starts with a **readable header**: `02` for the format version,
then `02` for anonymous or `01` for a member's signature, then the Group id. That
part is public on purpose, because a reader has to know which key opens the rest.
It also explains why the first bytes of every envelope look alike.

Everything that matters is in the **sealed tail**: content, author, file name.
Two submissions with different text share a header and share nothing after it.

That is the architectural point. GroupApi hands you sealed bytes and has no
opinion about where they go.

## Files

| File | Role |
| --- | --- |
| `src/App.tsx` | the two panes and the one button |
| `src/Member.ts` | your side: the Group, opening submissions, reading files |
| `src/Anonymous.ts` | the account-less sender |
| `src/store.ts` | the blind store |
| `src/server.ts` | your backend, mimicked in the page - it holds the API key, so read the warning at the top |

`Member` and `Anonymous` are React-free; the panes subscribe to them with
`useSyncExternalStore`.

Left out on purpose: nothing survives a reload, and there is no retry. Anyone
watching your storage still sees that a submission arrived. They cannot read it.
