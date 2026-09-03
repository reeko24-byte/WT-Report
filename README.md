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
📍Loc          : South Area
Segment      : 4(KOTA BATAK-KBJ)
KP                 : 26+000
Size Pipe     : 8"
Note             : Area ROW saat ini terpantau aman dan tidak ada indikasi yg mencurigakan.
```

Four things about it are deliberate.

**The label padding is copied, not computed.** Those runs of spaces are the ones
in the approved example, transcribed character for character. They do not line
the colons up — WhatsApp renders in a proportional font, so nothing would line
them up — and they are not all the same width. They are what the group has been
reading, which is worth more than tidiness. They live in `js/caption.js` and
nowhere else.

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
                                          SURVEILLANCE          ~38% opaque
                              PERTAMINA GAS · BINA REKAYASA ANUGRAH

  LAPORAN TEAM WT · South Area
  Segment 4(KOTA BATAK-KBJ) · 8"
  KP 26+000
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

`assets/watermark.png`, drawn into the top right at 38% opacity across 30% of the
frame's width.

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

Twenty-six columns. One row per KP, with **four columns per photograph** rather
than one set per row:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Tanggal | Waktu | Loc | Segment | Nama Segment | KP |

| G | H | I | J | K |
|---|---|---|---|---|
| Size Pipe | Kondisi | Note | Tim | Pelapor |

| L | M | N |
|---|---|---|
| Photo 1 | Photo 2 | Photo 3 |

| O–R | S–V | W–Z |
|---|---|---|
| Waktu / Kode / Lat / Long, photo 1 | …photo 2 | …photo 3 |

**Four columns per photograph, because three shots of one KP are taken minutes
and tens of metres apart.** A picture chosen from the gallery may carry a time
from another day or no position at all. One time and one pair of coordinates for
the whole row could only ever have been right about one of them. A photo with no
position leaves its pair genuinely empty rather than borrowing its neighbour's.

**Kondisi and Note are separate columns on purpose.** Kondisi is the short label —
*Area ROW Terpantau Aman* or *Lainnya* — so a month of walks can be counted and
filtered. Note is the sentence the group read. One column of free text could do
neither.

**Size Pipe and the coordinates are numbers, not text**, so they sort and filter,
and they sit on Excel's **General** format — so Format Cells reads *General*,
where anyone looks for a plain number, rather than *Custom*.

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

1. **Team** — Pipeline Walkthrough (Duri) or (Bangko).
2. **Nama Anda** — your name, from that team, or from *Roster lain*.
3. **Anggota lain** — tick up to three more. The whole roster is offered, not just
   your team: the approved example report pairs a Duri name with a name the
   personnel list files under no area at all, and a picker that could not express
   that would be wrong about the very report it was built from.
4. **Loc** — North Area or South Area. Your team's own area is filled in for you
   and can be changed.
5. **Segment** — filtered to that area.
6. **Size Pipe** — filled in from the segment, and editable. The crew standing in
   front of the pipe can read its diameter; the table can only remember what it
   was told. Clear the field to hand it back to the segment.

**Then, at every KP:**

7. **KP** — type the digits; the `+` appears by itself, so `26000` becomes
   `26+000`.
8. **Note** — *Area ROW Terpantau Aman* is already selected, because it is the
   answer all day. The sentence that will be sent is shown underneath. Tap
   *Lainnya* to write something else.
9. **Three photographs.** Ambil Foto, or Dari Galeri. Tap the × on a thumbnail to
   drop one.
10. **Simpan & Kirim** → the send screen, showing the report exactly as it will go
    out → **Kirim ke WhatsApp**.
11. **KP Berikutnya.**

**At the end of the day:** *Export ke Excel* → *Buat File Excel* → *Simpan ke
Files* (Android) or *Kirim File ke WhatsApp* (iPhone).

The crew and the assignment **stay** — they are the same from the first KP to the
last, and re-picking them twenty times a day is how a segment ends up wrong on
half a day's records. They are on screen the whole time instead, with one link to
change them. The **KP is always cleared** after a save: it is the identity of the
record, and a carried-over value would look entirely valid while being the
previous point's.

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
one go. You can still edit the text in WhatsApp before pressing send.

Whether the receiving app keeps the accompanying text is up to that app and the OS
version, not something the page can force — so **Salin Caption stays on screen**
rather than hidden behind a failure. The line under the button says which of the
two the browser has agreed to:

| It says | Meaning |
|---|---|
| *Foto dan caption dikirim bersamaan* | Both are being handed over |
| *Browser ini hanya mengirim foto* | Photos only — copy the caption first |
| *Browser ini tidak bisa membagikan foto* | No file sharing here; open in Safari or Chrome |

Sending is deliberately two taps on the export screen (build, then send). A
browser withdraws a page's permission to open the share sheet if the button's
handler waits on anything first, so the file is built on one tap and handed over
on the next.

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

**Bump `CACHE_VERSION` in `sw.js` on every deploy.** It is what pushes the update
to phones that already have the app on their home screen. The version marker at
the bottom of the survey screen reads the live cache name, so it cannot claim to
be newer than it is.

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

Four judgement calls were made where the sources did not agree or did not say.
None of them blocks anything; all four are one edit to reverse.

**Segments 10 and 12 are listed separately, unlike the Android app.** ARROW treats
them as one `10/12` because assets on that shared Batang–Dumai right-of-way cannot
be attributed to one pipe. But they are two pipes of different diameter — 24" and
20" — and this report has to name one Size Pipe. Merging them would have made that
field a guess. If the walkthrough teams do file that corridor as one, merge the
two entries and set Size Pipe by hand.

**`KP : 26+000`, not `26 +000`.** The approved example has a space before the `+`.
Every other tool in this family writes `XX+XXX` with no space, and the field
formats as you type, so this follows them. Say the word and it is one line in
`js/options.js`.

**Segment lengths are not enforced.** ARROW flags a KP past a segment's documented
end; this app does not, because a walkthrough is not an asset register and the
brief does not ask for it. Easy to add later from `SegmentKpRange.kt`.

**The interface is Indonesian only.** ARROW's PWA and ROWPowerline both carry an
ID/EN switch. This one does not, because the report itself is Indonesian in both
of those anyway and nothing here is written for an English reader. Adding it is
mechanical if it is wanted.

**Nurdianto is filed under no team**, because the personnel list gives him no
area. He appears under *Roster lain* for both crews and can be picked as the
reporter or as a team-mate. If he belongs to one, add `team: 'Duri'` (or
`'Bangko'`) to his roster entry.

---

## What is in here

```
index.html              six screens: crew, assignment, survey, send, list, export
styles.css              light, high contrast, 52px targets — built for direct sun
manifest.webmanifest    home-screen install
sw.js                   offline shell; bump CACHE_VERSION to deploy
assets/watermark.png    the top-right mark — replace this file to change it
icons/                  home-screen icons
js/options.js           roster, teams, zones, segments, conditions, KP, numbers, time
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

- **The whole flow**, crew → assignment → KP → three photographs → save → send
  screen, with the report text matching the approved shape character for
  character.
- **The photo pipeline** on both landscape and portrait captures: watermark,
  wrapped information band, micro-print and seal all placed and legible.
- **The seal**: SHA-256 through WebCrypto, a stable 48-bit code, and the full
  digest stored on the record.
- **The Excel**: built, written to disk and re-opened with a spreadsheet library.
  Zip intact, 26 columns, one row per point, six embedded photographs, frozen
  panes at G2, autofilter over `A1:Z3`, Size Pipe and coordinates numeric on
  General, empty coordinate cells genuinely empty for a photo with no fix, and
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
