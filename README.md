# Walkthrough Surveillance (WT)

A web app for the pipeline walkthrough teams. Runs offline from the phone's home
screen, on any mobile browser. For each KP it produces the three things the brief
asks for:

- **one button** that sends the three photographs and the `LAPORAN TEAM WT`
  report to the WhatsApp group,
- **photographs stamped in their own pixels** with who walked, where, when — plus
  the Walkthrough Surveillance mark and a verification code that makes a later
  edit of that timestamp detectable, and
- **one button** that exports the day to Excel with the photographs embedded.

No backend, no upload, no account, no build step. What is in this folder is what
runs.

It is a separate app from `arrow-pwa`, `rowpowerline` and the Android project.
Nothing in any of them is used at runtime; they were read only to reuse the parts
that were already proven — the photo pipeline, the dependency-free `.xlsx`
writer, the Exif reader and the share-sheet handling — and to take the zone and
segment lists from `AssetOptions.kt`.

---

## The report it sends

Exactly the approved shape:

```
LAPORAN TEAM WT
✅ Ari Kurniawan
✅ Nurdianto
Location  : South Area
Segment   : 4(KOTA BATAK-KBJ)
KP        : 25 + 666
Size Pipe : 8"
Note      : Area ROW saat ini terpantau aman dan tidak ada indikasi yg mencurigakan.
```

Four things about it are deliberate.

**The colons line up, and the padding that does it is computed, not typed.**
Every label is padded to the width of the longest, so renaming a label or adding
a line can never leave the block half-aligned — which is what had happened to the
hand-spaced version this replaced. The labels live in `js/caption.js` and nowhere
else; their widths are not written down anywhere at all.

It lines up exactly in the app's preview and in anything monospaced. **WhatsApp
sets messages in a proportional font**, where equal numbers of characters are not
equal widths, so there the colons land close together rather than in a
dead-straight column. Nothing a plain message can do changes that, short of
wrapping the whole report in a code block — which would change how every other
part of it reads.

**Every name gets a tick.** The reporter first, then whoever walked with them, in
the order they were picked, one line each. The group counts the ticks to see how
many people were out.

**The Note line is a whole sentence, not the button that was tapped.** *Area ROW
Terpantau Aman* is what the operator taps, what the photograph is stamped with,
and what the spreadsheet can be filtered on; the report gets the sentence that
belongs to it. The sentence is shown on the survey screen under the choice, so it
is never sent unseen.

**There is no timestamp line.** WhatsApp stamps the message itself, and the
approved shape has no such line. The time is burned into the photographs and
written into the spreadsheet, where it cannot be lost.

---

## The photograph

Three per KP, and all three are burned with the same stamp:

```
                                          WALKTHROUGH        ← top right,
                                          SURVEILLANCE          ~55% opaque
                              PERTAMINA GAS · BINA REKAYASA ANUGRAH

  LAPORAN TEAM WT · South Area
  Segment 4(KOTA BATAK-KBJ) · 8"
  KP 25 + 666
  Area ROW Terpantau Aman
  Tim: Ari Kurniawan, Nurdianto
  2026-09-03 08:14:22
  Lat: 1.685600, Long: 101.083251                        WT-VERIFY
  Jalan Lintas Duri-Dumai, Desa Balai Makam,           6CDC-1680-7DF3
  Kecamatan Bathin Solapan, Kabupaten Bengkalis          ← bottom right
```

Blank lines are dropped, so a photo taken with no fix and no signal carries
fewer. **A missing fix does not block the camera** — the KP is what the report is
written in, and a walk should not stop because a fix is slow under canopy. The
address line needs signal; the rest never does, and it cannot be filled in later
because the pixels are already written.

Long lines **wrap** rather than shrinking the whole block. The address is the one
line that varies, and letting it drag every other line down to unreadable is the
wrong trade. The band never takes more than 38% of the frame.

### The logo watermark

`assets/watermark.png`, drawn into the top right at 55% opacity across 30% of the
frame's width.

**Every glyph carries a hard dark outline as well as a soft shadow**, and that is
not decoration. White fill alone reads beautifully against grass and sky and all
but disappears on anything pale — which is what happened the first time, on a
photograph of a printed page. The outline is what carries the mark on light
ground, the shadow is what separates it from dark ground, and together they mean
the mark never depends on what is behind it. The opacity is set for the harder of
the two cases: a mark that cannot be read on a document photograph is not
identifying anything.

**To use the real artwork, replace that one file.** Any transparent PNG works; it
is scaled to 30% of the width and its own aspect ratio is kept. Nothing else has
to change. The one shipped is a text lockup, not a reproduction of the Pertamina
Gas or Bina Rekayasa Anugrah logos — that artwork was not available, and setting
the names in type is honest where a redrawn logo would not be.

The two numbers are `WATERMARK_OPACITY` and `WATERMARK_WIDTH_FRACTION` at the top
of `js/photo.js`, and they are the only place either is decided.

---

## The verification code, and what it is actually for

This is the answer to *"safeguard against illegal photo editing of the
timestamp"*, so it is worth being precise about what it does and does not do.

**The problem.** The time and place are burned into the pixels, and that is the
point — a picture forwarded out of the group and pasted into a document months
later still says when and where it was taken. But pixels can be painted over.
Someone filing yesterday's walk as today's has to change six characters, and
nothing in the image itself would disagree with them.

**What the app does.** Before anything is drawn — before the photograph is even
resized — the bytes that came off the camera are hashed together with the facts of
the record: the timestamp, the KP, the segment, the zone, the crew, the fix. The
first 48 bits of that SHA-256 are printed in the corner as `6CDC-1680-7DF3`, and
the **whole** digest is stored with the record and written into the spreadsheet.

**How the office checks a photograph.** Read the code off the picture. Find it in
the `Kode Foto 1/2/3` column of the Excel. The `Waktu Foto` beside it is the time
the app wrote. If the picture says something else, the picture was edited after it
left the phone.

**And the second line of defence.** Behind the text of the bottom band, the
timestamp and the code are micro-printed diagonally, repeated, at about 10%
opacity. Painting a rectangle over the printed time cuts those diagonal runs, and
the break is obvious against the rest of the band — no reference copy needed.

**What this is not.** It is not a signature. The phone holds no secret, so anyone
with this source could compute a valid code for a picture of their own. It detects
a photograph that was **altered after the app wrote it**, which is the thing the
brief asks to guard against. Forging a fresh record end to end is a different
problem and needs a server; there is no server here, by design.

`WT-VERIFY` in the corner means SHA-256. **`WT-BASIC` means the app was opened
over plain `http`**, where browsers withhold WebCrypto, and a much weaker hash was
used instead. It says so on the photograph rather than passing itself off as the
real thing. Serve the app over HTTPS and it will never appear.

---

## The Excel it produces

Twenty-eight columns. One row per KP, with **four columns per photograph** rather
than one set per row:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Tanggal | Waktu | Location | Segment | Nama Segment | KP |

| G | H | I | J | K | L | M |
|---|---|---|---|---|---|---|
| Penugasan From | Penugasan To | Size Pipe | Kondisi | Note | Tim | Pelapor |

| N | O | P |
|---|---|---|
| Photo 1 | Photo 2 | Photo 3 |

| Q–T | U–X | Y–AB |
|---|---|---|
| Waktu / Kode / Lat / Long, photo 1 | …photo 2 | …photo 3 |

**Four columns per photograph, because three shots of one KP are taken minutes
and tens of metres apart.** A picture chosen from the gallery may carry a time
from another day or no position at all. One time and one pair of coordinates for
the whole row could only ever have been right about one of them. A photo with no
position leaves its pair genuinely empty rather than borrowing its neighbour's.

**Penugasan is split across two columns**, the way ROWPowerline splits its
location range, because the office sorts and filters on the ends of a stretch
separately and a single `00 + 000 - 10 + 000` cell can do neither. It is stored on
every row rather than once for the day: a day can carry two assignments, and what
matters is which stretch each KP belongs to, not which one happened to be on
screen when the file was exported. Set beside the `KP` column, it is what makes a
coverage gap visible — assigned `00 + 000` to `10 + 000`, recorded up to `07 + 200`,
and the rest of the stretch was not walked.

**Tim is the whole crew, reporter included** — the same names in the same order
as the ticks on the WhatsApp report, so the column can be read on its own.
**Pelapor** names who filed it, which is a separate question from who walked; the
reporter appearing in both columns is deliberate, not a duplicate. (Tim briefly
held the crew *minus* the reporter, on the reasoning that Pelapor named them
already. Nobody reads two columns to count a team, and a walk of two read as a
walk of one. `WT.teamNames()` in `js/options.js` is now the single definition
that the caption, the photo stamp and this column all use.)

**Kondisi and Note are separate columns on purpose.** Kondisi is the short label —
*Area ROW Terpantau Aman* or *Lainnya* — so a month of walks can be counted and
filtered. Note is the sentence the group read. One column of free text could do
neither.

**The coordinates are numbers, not text**, so they sort and filter, and they sit
on Excel's **General** format — so Format Cells reads *General*, where anyone
looks for a plain number, rather than *Custom*.

**Size Pipe is text** — `8"`, or `24" & 20"` for segment 10/12, which runs two
pipes down one right-of-way. It was a number until that segment was merged back
into one, and no number holds two diameters. Nothing useful is lost: the
autofilter still groups the sheet by pipe, which is all that column was ever for,
and summing diameters was never going to mean anything.

The header row is frozen, and so are the six columns that identify the point
(through `KP`). Without that, scrolling out to the verification codes leaves a
screen of hex with nothing to say which row it belongs to. An **autofilter** is
already on, so Kondisi and Segment can be filtered without setting one up.

**Every photograph is written at exactly 5.00 × 3.75 cm**, whatever shape it was
taken in. Uniform is the point: the pictures are all the same size, so the rows
line up down the page and the sheet reads as one document. Portrait and landscape
shots are therefore stretched to fit — the same trade the ARROW and ROWPowerline
reports make. Those two numbers are `PHOTO_WIDTH_CM` and `PHOTO_HEIGHT_CM` at the
top of `js/xlsx.js`; change them and the column width and row height follow.

The file is named for when it was built and who built it:

```
WT_20260903_081422_Ari_Kurniawan.xlsx
   └ date ┘└ time ┘└  reporter  ┘
```

The **time** is not decoration. Exporting twice in a day is normal, and with only
the date both files carry the same name — two identical-looking attachments in the
group, and the second silently overwriting the first when the office saves them
into one folder.

---

## A day, from start to sent

**Once, in the morning:**

1. **Team** — Pipeline Walkthrough (Duri), (Bangko) or (South).
2. **Nama Anda** — your name, from that team, or from *Roster lain*.
3. **Anggota lain** — tick up to three more, or none: a one-man walk is a normal
   state, not an error. The whole roster is offered, not just your team, because
   the approved example report is filed by a Duri name walking with a South name.
   Crews lend each other people.
4. **Location** — North Area or South Area. Your team's own area is filled in for
   you and can be changed.
5. **Segment** — filtered to that area.
6. **Penugasan (KP)** — the stretch you are sent to walk today: *Seg 8 from KP
   00 + 000 to 10 + 000*. **Seluruh segment** fills it with the whole line in one
   tap, using the segment's as-built length, so the commonest assignment of all
   costs nothing to state.
7. **Size Pipe** — filled in from the segment, and editable. The crew standing in
   front of the pipe can read its diameter; the table can only remember what it
   was told. Clear the field to hand it back to the segment.

**Then, at every KP:**

8. **KP** — type the digits; the `+` appears by itself, so `25666` becomes
   `25+666`. A KP outside the assigned stretch is flagged in amber and still
   saves — see below.
9. **Note** — *Area ROW Terpantau Aman* is already selected, because it is the
   answer all day. The sentence that will be sent is shown underneath. Tap
   *Lainnya* to write something else.
10. **Three photographs.** Ambil Foto, or Dari Galeri. Tap the × on a thumbnail to
    drop one.
11. **Simpan & Kirim** → the send screen, showing the report exactly as it will go
    out → **Kirim ke WhatsApp**.
12. **KP Berikutnya.**

**At the end of the day:** *Export ke Excel* → *Buat File Excel* → *Simpan ke
Files* (Android) or *Kirim File ke WhatsApp* (iPhone).

The crew and the assignment **stay** — they are the same from the first KP to the
last, and re-picking them twenty times a day is how a segment ends up wrong on
half a day's records. They are on screen the whole time instead, with one link to
change them. The **KP is always cleared** after a save: it is the identity of the
record, and a carried-over value would look entirely valid while being the
previous point's.

### A KP outside the assignment is flagged, never refused

Type a KP that falls outside the stretch on the assignment strip and an amber
line appears under the field naming the stretch. **Saving still works.**

Both halves of that are deliberate. Most of these are typos — a KP a digit out
lands kilometres away, and catching it while the crew are still standing there is
the whole value. But the crew are the ones standing there: assignments get
extended, a team gets waved onto the next stretch, and an app that refused the
record would simply lose it. The same rule the Android app follows — raise a
flag, never block.

### The photo buttons wait for the form

On purpose. The stamp is **burned into the photograph's pixels** at the moment of
capture, so a photo added before the KP was typed would carry a blank one — and
that is the one part nothing downstream can correct. The line underneath names
whatever is still missing. In practice nothing blocks: the Note is pre-selected,
so an ordinary KP is one field and three photographs.

If you change something **after** taking photos, the thumbnails are outlined in
amber and a warning appears: the pixels still show the old value. Retake them if
it matters.

### Three photographs are required

The brief asks for three, so three is what it takes to save. If that ever needs to
relax, `MIN_PHOTOS` in `js/options.js` is the one place it is decided.

### Dari Galeri

For photographs already on the phone. Pick up to three at once.

**A gallery picture never gets the phone's current position or clock.** It was
taken somewhere else, at some other time, and stamping "here, now" onto it would
put a plain falsehood into the part of the record nothing downstream can check.
Instead the app reads the picture's **own Exif** and burns that:

| Exif carries | Burned in |
|---|---|
| GPS and a capture date | Its own coordinates, its own date, and the address looked up from *those* coordinates |
| A date but no GPS | Its own date; no coordinate line at all |
| Nothing | The file's modified date; no coordinate line |

Gallery pictures are tagged in the strip — `galeri`, or `galeri · tanpa GPS` — so
it is visible at a glance which evidence was shot on the spot. Whether Exif
survives the picker is up to the phone; if the tag says *tanpa GPS*, the metadata
was gone before the app saw the file.

---

## Sending to WhatsApp

The button hands the photographs **and** the report to the phone's share sheet in
one go — one tap, nothing to paste. This is `navigator.share({ files, text })`,
character for character the same call ROWPowerline makes, and it must stay the
default.

Only where the browser refuses the pair do the photographs go alone. The caption
is then put on the clipboard inside the same tap and the send screen shows the
three steps for pasting it. **That is a fallback and must never become the normal
route** — an extra step on every KP, twenty times a day, is not a fix.

| The line under the button says | Meaning |
|---|---|
| *Foto dan caption dikirim bersamaan* | Both handed over — nothing to do |
| *Browser ini hanya mengirim foto* | Photos only; caption is on the clipboard, paste it |
| *Browser ini tidak bisa membagikan foto* | No file sharing here; open in Chrome or Safari |

### The share target decides whether it is one message or three

**This is the single most important thing to get right when sending, and it is
invisible from the result.** Found by Billy on 2026-09-06, after two wrong
diagnoses of mine.

Android's share sheet has two rows. The top row is **WhatsApp's direct-share
shortcuts** — one per recent chat, each showing the contact's picture. The row
below holds the **apps themselves**.

| Tapped | What the group gets |
|---|---|
| The **WhatsApp icon** (lower row), then pick the chat | Three photographs as **one album, one caption** ✅ |
| A **contact shortcut** (top row) | The caption stamped on **each** photograph — three messages ❌ |

Same photographs, same caption, same `navigator.share()` call. The difference is
entirely inside WhatsApp: the direct-share path captions each image on its own,
while the app icon opens WhatsApp's own chat picker and media editor, where one
caption covers the whole album.

Because nothing in the outcome explains why, the send screen says it every time,
in amber, directly above the button — and it is step 6 of `PANDUAN.txt` with the
warning that it is the one most often got wrong.

**Two diagnoses I got wrong before Billy found it**, recorded so they are not
repeated: it is not the photo count (a live album from 31 August held three), and
it is not orientation (every photograph is normalised before sharing). It was
also not a WhatsApp or Chrome update, which the evidence appeared to support
right up until the real cause turned out to be which icon a thumb landed on.

**What was tried and withdrawn:** dropping the caption from the share payload and
asking for a paste (correct output, an extra step on every KP — rejected), and a
per-phone switch between the two (unnecessary once the real cause was known).
Neither is in the code. The share is one tap, caption included, as it always was.

Sending the Excel is deliberately two taps on the export screen (build, then
send). A browser withdraws a page's permission to open the share sheet if the
button's handler waits on anything first, so the file is built on one tap and
handed over on the next.

### On Android, the Excel file cannot be shared at all

This is Chrome's own policy, not a fault in the app, and it is settled — see the
ROWPowerline notes. Chrome only lets a web page share files whose extension is on
its allowlist: images, audio, video, text, csv, html, svg and pdf. **`.xlsx` is
not on it.** `navigator.canShare()` does not consult that list, so it answers yes
and `share()` is then refused with `NotAllowedError: Permission denied` — the same
error a missing user gesture produces. Photographs share perfectly from the same
screen a moment earlier, because `.jpg` is on the list.

So on Android the export screen puts **Simpan ke Files** first. The file lands in
**Download**, and from there: WhatsApp › group › **Attach › Document**. Two extra
taps, once a day. The share button stays because on iPhone the same tap works.

### If a share fails

The status line names what the phone reported, and a second line gives the facts
that decide whether sharing can work at all:

```
home screen · Android 12 · share yes · canShare yes · secure · share idle
```

Report those two lines rather than the symptom.

| What it says | What it means |
|---|---|
| `NOT SECURE` | Served over plain `http`. Web Share needs HTTPS — and so does the SHA-256 seal. Publish it to GitHub Pages. |
| `share no` / `canShare no` | This browser has no file sharing. Open in Safari or Chrome rather than an in-app browser. |
| `share still open` | A previous share sheet never closed. Close the app completely and reopen it. |
| `share idle`, `secure`, still `NotAllowedError` | On the Excel file: the Android allowlist above. |

### Sending twice in a day is normal, and safe

A **WhatsApp send** and an **Excel export** are tracked separately, because they
are different events. The Excel export covers **only what has not been exported
yet**, so 20 KPs before lunch and 20 after gives the office two files of 20 — not
20 and then 40. *Sertakan juga N yang sudah diexport* puts the earlier ones back.

**A point is marked as exported when the file is saved or shared — not when it is
built.** Nothing has left the phone until Simpan ke Files or the share sheet has
actually taken it.

Exported points **stay on the phone** until **Hapus data yang sudah diexport** is
used, and that button **cannot touch anything unexported**. Reach for it
mid-survey by mistake and the work still on the phone is safe.

---

## Deploying it

Static files. Publish the folder to GitHub Pages (or any HTTPS host) and open the
URL on the phone, then **Add to Home Screen**.

**HTTPS is not optional.** Three things need a secure context: the Web Share
sheet, geolocation, and the SHA-256 seal. Over plain `http` the app still runs,
but photographs are stamped `WT-BASIC` and sharing will not work.

### Bump `CACHE_VERSION` in `sw.js` on every upload

Not a label — **it is the entire update mechanism**, and forgetting it is the one
deployment mistake that gives no error message at all.

A browser decides whether to install a new service worker by comparing the
**bytes** of `sw.js` against the copy it already has. It is that new worker which
re-caches everything else. So if `sw.js` has not changed, nothing has changed as
far as the phone is concerned: every other file can be replaced on the server and
a phone with the app on its home screen will keep serving the old ones, silently,
for as long as it stays installed. Nothing fails, nothing warns, and the app just
carries on being the version it was.

**The version marker at the bottom of the survey screen prints two things, and
the pair is what matters:**

```
kode v7 · cache v7                          ← running the uploaded version
kode v5 · cache v7 · TUTUP APLIKASI & BUKA LAGI   ← downloaded, not yet running
```

`kode` is a constant in `js/app.js`, so it is stale exactly when the running
code is stale. `cache` is the service worker's cache name, so it says what has
been downloaded. **When they disagree the files have arrived and the app has
simply not been restarted** — closing it fully and reopening finishes the job.

That line used to print the cache name alone, on the reasoning that a constant
would be served from the same stale cache and lie about itself. True, and it
missed the case that actually happened on 2026-09-06: the new worker installs and
builds the new cache, but the page keeps executing the JavaScript it parsed at
launch. The marker read `v6` while every screen was still `v3`'s, sending an
afternoon chasing a bug that had already been fixed. **Bump `BUILD` in
`js/app.js` together with `CACHE_VERSION`** — they are a pair, and the diagnostic
is worthless if they drift.

| Version | What changed |
|---|---|
| `v1` | first build |
| `v2` | `Location` label and aligned colons · Pipeline Walkthrough (South) · `Tim` carries the whole crew · `10/12` merged with `24" & 20"` · watermark outlined and raised to 55% · KP prints `XX + XXX` · assigned stretch (Penugasan) |
| `v3` | *withdrawn* — dropped the caption from the share payload and asked for a paste. Correct output, but an extra step on every KP; rejected |
| `v4` | caption travels with the photographs again, as ROWPowerline does; the paste steps show only when the browser refuses the pair |
| `v5` | *withdrawn* — per-phone switch between the two share shapes; unnecessary once the real cause was found |
| `v6` | the send screen names the share target to tap: WhatsApp's app icon, not a contact shortcut |
| `v7` | version marker prints running code *and* cache, so "downloaded but not restarted" can no longer look like "already updated" |

Everything is cached for offline use on first load, `assets/watermark.png`
included — it is part of the shell, not an extra, because a walk that started
offline without it would produce a day of unmarked pictures.

---

## Changing the lists

All of it is in `js/options.js`, and all of it is **data**: it is written into the
report and the spreadsheet exactly as spelled there. Changing a spelling silently
splits one segment, or one crew member, into two the next time somebody sorts the
sheet.

- **roster** — names and badge numbers as the personnel list spells them.
- **teams** — the two crews, each with the area it usually works, used only as a
  default.
- **zones** and **segments** — from the segment table and `AssetOptions.kt`.
- **conditions** — the two Note answers, each as a short `label` and the full
  `note` sentence.

---

## Decisions worth confirming

Judgement calls made where the sources did not agree or did not say. **All of
these have now been settled by Billy**, so they are written up as decisions
rather than questions — with what was got wrong first, because that is the part
worth not repeating. Each is still one edit to reverse.

**`10/12` is one segment, as it is in the Android app.** I first split it into a
10 and a 12, reasoning that they are two pipes of different diameter and the
report has to name one Size Pipe — and that was the wrong way round. The crews
walk that Batang–Dumai right-of-way as one, so the segment is one and it carries
both diameters: `Size Pipe : 24" & 20"`. That is why a segment's `size` is a list
in `js/options.js` and not a number, and why the spreadsheet's Size Pipe column is
text. A segment with two pipes is a real state, not an unfilled field.

**A KP prints as `25 + 666`, spaced either side of the plus.** This took two
passes, and the confusion is worth recording. I first dropped the space
altogether, on the grounds that every other tool in this family writes `XX+XXX`.
Billy asked for it back, so I read the spacing off his example as `25 +666` —
which was itself a typo in that message. `XX + XXX` is the intended form and the
one now in the code.

It is a **printing** convention and nothing more: `WT.kpPrint()` in
`js/options.js` inserts the spaces, and everything a person reads goes through
there — the report, the photograph, the list, the spreadsheet. What is typed and
stored is still `25+666`, because the input mask has to push the caret past the
`+` as you type and doing that around spaces as well is how a KP ends up
`2 5 + 66`; comparing two KPs, or checking one against a segment length, is also
simpler on the tight form. One canonical string in the database and one printed
form on the way out is why correcting the spacing was a one-line change.

**Segment lengths bound the assignment, and nothing else.** The as-built figures
from `SegmentKpRange.kt` are in `js/options.js` as each segment's `end`, and they
do one job: *Seluruh segment* uses them to fill the assigned stretch in a tap.
The app never checks a recorded KP against a segment's length — only against the
stretch the crew said they were walking, which is the tighter and more useful
test, and even that only raises a flag.

**The interface is Indonesian only** — confirmed. ARROW's PWA and ROWPowerline
both carry an ID/EN switch; this one does not, because the report itself is
Indonesian in both of those anyway and nothing here is written for an English
reader.

**Pipeline Walkthrough (South) is a crew of one.** The personnel list gives
Nurdianto no area; South is his, and he is its only member. Nothing about the app
minds: only a reporter is ever required, team-mates are optional, and when the
sole member of a crew is the reporter their section of the picker is left out
rather than shown as an empty heading. He still appears under *Roster lain* for
the other two crews, which is what the approved example report needs.

---

## What is in here

```
index.html              six screens: crew, assignment, survey, send, list, export
styles.css              light, high contrast, 52px targets — built for direct sun
manifest.webmanifest    home-screen install
sw.js                   offline shell; bump CACHE_VERSION to deploy
assets/watermark.png    the top-right mark — replace this file to change it
icons/                  home-screen icons
js/options.js           roster, teams, zones, segments, conditions, KP, sizes, time
js/caption.js           the LAPORAN TEAM WT report — the approved wording
js/seal.js              the verification code
js/photo.js             orient, resize, stamp, watermark, seal, compress
js/exif.js              a gallery picture's own place and time
js/geo.js               GPS, and the place name for the stamp
js/db.js                IndexedDB — points and photographs, sent and exported marks
js/xlsx.js              the .xlsx writer, no library
js/app.js               screen wiring
```

Written in ES5 throughout, with no dependencies and no build step, so it runs on
whatever browser the crew's phone happens to have.

---

## Verification state

Checked on 2026-09-03, running the app from a local server:

- **The whole flow**, crew → assignment (including the assigned stretch) → KP →
  three photographs → save → send screen, with the report text matching the
  approved shape character for character.
- **The assignment**: *Seluruh segment* filling `00 + 000 – 12 + 820` for segment 8
  from its as-built length, narrowing it to `10 + 000` by hand, and a KP of
  `11 + 200` raising the out-of-range flag while still saving.
- **The photo pipeline** on both landscape and portrait captures: watermark,
  wrapped information band, micro-print and seal all placed and legible.
- **The seal**: SHA-256 through WebCrypto, a stable 48-bit code, and the full
  digest stored on the record.
- **The Excel**: built, written to disk and re-opened with a spreadsheet library.
  Zip intact, 26 columns, one row per point, six embedded photographs, frozen
  panes at G2, autofilter over `A1:AB3`, 28 columns including the split
  Penugasan, coordinates numeric on General, empty coordinate cells genuinely empty for a photo with no fix, and
  `&`, `<`, `>`, `"` in a note round-tripping exactly.
- **Crew and assignment survive a reload** and the app reopens on the survey
  screen.

Not yet checked, and only a real device can:

- **Offline start-up and the service worker.** The preview environment refuses to
  register one, so `sw.js` was verified to parse but not to run. Confirm on the
  phone: load the app, turn on flight mode, and reopen it from the home screen.
- **The WhatsApp share itself.** Confirm on the phone that the three photographs
  and the report arrive together.
- **A real camera capture**, as opposed to a synthesised one, through the phone's
  own camera app.
