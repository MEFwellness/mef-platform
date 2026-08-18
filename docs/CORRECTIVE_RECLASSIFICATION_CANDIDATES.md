# Reclassification candidates for the empty corrective slots

**Status: a proposal for review. Nothing in this document has been applied.**
No exercise metadata was changed by the build that produced it, and none should
be changed until Osei has read the evidence column and said yes to a specific
row.

Measured 2026-08-17 against the real catalog (853 exercises, 824 of them
client-assignable) using the same pool loader and the same blueprint rules the
generator itself uses, so every number here is what the engine actually sees
rather than a hand count.

---

## 1. What is actually empty, measured rather than assumed

A slot is "empty" when **not one** client-assignable exercise could fill it, at
any severity, ignoring budgets. Two equipment settings are shown because they
answer different questions: the default set is what a member is assumed to own,
and the wide set separates "there is no video" from "there is a video but it
needs a machine".

| Blueprint | Block | Slot | Empty with default equipment | Empty with any equipment |
|---|---|---|---|---|
| Lower Cross | Release | hip flexors | yes | yes |
| Lower Cross | Release | TFL | yes | yes |
| Lower Cross | Release | lumbar erectors | yes | yes |
| Lower Cross | Mobility | TFL | yes | yes |
| Upper Cross | Release | pecs | yes | yes |
| Upper Cross | Release | upper traps | yes | yes |
| Upper Cross | Release | lats | yes | yes |
| Upper Cross | Release | levator scapulae | yes | yes |
| Upper Cross | Mobility | pecs | yes | no |
| Upper Cross | Mobility | levator scapulae | yes | yes |
| Upper Cross | Stability | deep neck flexors | yes | yes |
| Upper Cross | Stability | serratus anterior | yes | no |
| Forward Head | Release | suboccipitals | yes | yes |
| Forward Head | Release | upper traps | yes | yes |
| Forward Head | Release | SCM / scalenes | yes | yes |
| Forward Head | Release | chest | yes | yes |
| Forward Head | Mobility | suboccipitals | yes | yes |
| Forward Head | Mobility | chest | yes | no |
| Forward Head | Stability | deep neck flexors | yes | yes |
| Forward Head | Stability | thoracic extensors | yes | yes |
| Flat Back | Release | hamstrings | yes | yes |
| Flat Back | Release | glutes | yes | yes |
| Flat Back | Release | abdominals | yes | yes |

### The single biggest finding, which was not in the original list

**The Release block is now empty for every blueprint, and one row of metadata is
the reason.**

There is exactly one client-assignable exercise carrying the `release` role:
**Quadriceps Roll** (`cc3a2bb8-efcf-440d-9357-887ce0b04346`, foam roller,
moderate strain). Its `muscles_stretched` array is **empty**. The Release block
selects by "role is release AND it stretches one of this pattern's tight
muscles", so an exercise that names no muscle can never match any slot, for any
pattern. The Release block therefore has zero candidates system-wide, and every
generated program now opens with an empty Release block.

Every release option the engine used before this build was one of the eleven
MEF-authored foam-roll and ball-release exercises, none of which has a video.
That is the video rule working exactly as intended, and it is also the largest
single quality cost of applying it. The coach screen now says so per block
rather than handing over a thin program silently.

### The other pattern worth naming

Forward Head has **both** of its long muscles empty (deep neck flexors,
thoracic extensors), so its Stability block is empty at every severity, proved
by a test rather than asserted. **Forward Head is not deliverable as a program
until videos exist for those two.** Nothing about this build changed that fact;
it made it visible.

---

## 2. Candidate table

Confidence means: how safely could this row's metadata be widened without a
coach re-reviewing the exercise itself.

- **High** = the exercise already carries the right idea under a different
  label, or is already doing the movement the slot describes. A label fix.
- **Medium** = the movement plausibly covers the slot but a coach should watch
  the video once before agreeing.
- **Low** = it is the nearest thing in the catalog and is probably not good
  enough. Listed so the search is on the record, not as a recommendation.

| # | Exercise | External id | Slot it might cover | Evidence from its own metadata | Confidence |
|---|---|---|---|---|---|
| 1 | Quadriceps Roll | `cc3a2bb8-efcf-440d-9357-887ce0b04346` | Release, Lower Cross **hip flexors** (and quads generally) | Already tagged `release` + `mobility`, equipment `foam roller`, name and description are a foam-roll of the front of the thighs ("a foam roller positioned under the front of your thighs"). Its `muscles_stretched` is empty, which is why it fills nothing. Adding `hip flexors` and `quads` would give three of the four blueprints a real Release option with no new video. | **High** |
| 2 | Hip flexor stretch | `abfd0396-b9b3-41b3-b8ec-88ce2faf0462` | Mobility, Lower Cross **TFL** | Already tagged `stretch` + `mobility`, `bodyweight`, low strain, and its own `muscles_stretched` already contains **`tensor fasciae latae`**. The blueprint slot's canonical label is `TFL`. This is a vocabulary mismatch, not a clinical judgement: five assignable exercises use `tensor fasciae latae` and only the three non-assignable MEF rows use `TFL`. | **High** (see caveat below) |
| 3 | Lateral neck stretch (left) | `50f6c403-a7eb-4c43-9723-c9c4ee7defc7` | Mobility, Upper Cross / Forward Head **levator scapulae**, and **upper traps** | Tagged `stretch` + `mobility`, `bodyweight`, low strain. Description is the textbook lateral tilt: "tilt your head to the left, bringing your left ear toward your left shoulder while keeping your right shoulder down". Its current `muscles_stretched` is `{full body}`, which is simply a bad tag on a neck stretch. Already in a live Root Movement session, so it has a watched video. | **Medium-High**. The lateral tilt loads upper trapezius most; levator scapulae needs the head rotated away as well. Honest answer: certain for upper traps, partial for levator. |
| 4 | Lateral neck stretch (right) | `dfbfc890-af85-4be4-a8c6-782f666f538d` | as above | Mirror of #3, same tagging problem. | **Medium-High** |
| 5 | neck stretch | `3bb357f4-d722-42e5-9c1f-166f2a2e91f2` | Mobility, Forward Head **suboccipitals** | Tagged `stretch` + `mobility`, `bodyweight`, low strain, already stretching `neck`, `upper traps`, `traps`, `SCM`. Description is "tilt or rotate the head through gentle ranges of motion". | **Low-Medium**. Generic neck range of motion is not a suboccipital release, which needs sustained deep upper-cervical pressure or a chin glide. Listed because it is the closest video-backed thing that exists. |
| 6 | Head Turns Neck stretches | `8f35f8d8-b982-44af-8b71-4254b5be2532` | Mobility, Forward Head **suboccipitals** or **SCM / scalenes** | Tagged `stretch` + `mobility`, low strain, and already stretching `cervical extensors` (the layer the suboccipitals sit under) plus `SCM` and `upper traps`. | **Low-Medium**, and separately blocked: its equipment is `chair`, which is outside the default bodyweight / foam roller / ball set, so it would only ever appear for a member with a chair recorded. |
| 7 | Superman extensions | `2a4df469-77c8-4468-92cb-2003c90602dd` | Stability, Forward Head **thoracic extensors** | Tagged `strength`, `bodyweight`, moderate strain, `spinal_flexion_core` false. Prone extension of chest, arms and legs, which is thoracic and lumbar extensor work. Currently tagged `{back}`, which is not a blueprint label. | **Medium**. It genuinely trains the thoracic extensors. It is also a fairly aggressive first exercise for a neck-and-upper-back pattern, and it loads the lumbar extensors just as hard, which matters for a member who also has Lower Cross. |
| 8 | Superman crunches | `b627fc87-cf16-443b-b87d-d1ba39ed8ca9` | Stability, Forward Head **thoracic extensors** | Same family as #7, same tags, description explicitly "contracting your lower back and glutes". | **Low-Medium**. More lumbar than #7 by its own description. |
| 9 | Swimmers | `0ff4b70c-8c21-42a0-83c9-a0aa4fcc4b4a` | Stability, Forward Head **thoracic extensors** | Tagged `strength`, `bodyweight`, moderate strain, already strengthening `lumbar erectors`, `glutes`, `hamstrings`, `shoulders`, `lats`. Prone alternating limb lift. | **Medium**. The gentlest of the prone extension family and the most plausible for a first phase. |
| 10 | Scapula hold | `42a043cf-29ba-4e98-a6fe-d9cbc61f7015` | Stability, Upper Cross **serratus anterior** | Tagged `strength`, `bodyweight`, moderate strain, plank with deliberate scapular engagement. Currently strengthening `{back}` only. | **Medium**. Plank scapular protraction is serratus work, but "hold this position focusing on proper scapular engagement" is vague enough that a coach should watch it. |
| 11 | Scapula push ups | `16a76541-f17e-49fe-832c-27776a9ec2e3` | Stability, Upper Cross **serratus anterior** | Tagged `mobility` + `strength`, `bodyweight`. Scapular protraction and retraction in a high plank, which is the classic serratus drill. Currently strengthening `{pecs}`. | **Medium-High**. The most textbook serratus exercise in the video-backed catalog. |
| 12 | Cobra pose / Sphinx pose | `1e381fba-...`, `c490cf34-...` | Mobility, Forward Head **chest** (pecs) | Both tagged `stretch`, `bodyweight`, low strain, stretching `{back}`. Cobra's description is "press through your palms to lift your chest", which does open the front of the chest. Sphinx is already in a live Root Movement session. | **Low**. These are spinal extension poses tagged as back stretches. Calling them a pec stretch would be a stretch of the metadata as much as of the muscle. |

### Caveat on candidate #2, which matters

Adding `TFL` to **Hip flexor stretch** helps Lower Cross and does nothing for a
member who also has **Flat Back**. That exercise's own `muscles_stretched`
already includes `lumbar erectors` and `hip flexors`, and both of those are
Flat Back's **long** muscles. The engine's hard "never stretch a long muscle"
backstop will therefore keep excluding it for any member with Flat Back
detected, correctly. This is not a reason not to do it; it is a reason not to
expect it to close the gap for everybody.

### The label question underneath candidate #2

`TFL` and `tensor fasciae latae` are the same muscle written two ways, and the
split is not random:

- `TFL` is used by exactly three rows, all `mef_custom`, all without video.
- `tensor fasciae latae` is used by five rows, all Your Move, all with video.

So the blueprint asks for a label that only the unfilmable exercises use. That
is worth deciding once, as a vocabulary decision, rather than row by row. The
same shape may exist for `cervical extensors` versus `suboccipitals` and for
`upper back` versus `thoracic extensors`, both of which appear only on MEF rows.

---

## 3. Slots that remain at zero no matter what is reclassified

Nothing in the video-backed catalog can honestly fill these. They need
recording, not retagging.

| Slot | Why nothing fits |
|---|---|
| **deep neck flexors** (long, Upper Cross + Forward Head) | Deep neck flexor work is chin tuck and cranio-cervical flexion holds. A search of all 824 assignable exercises for "chin", "nod" and any cervical flexion cue returns nothing. The only exercises that do it are MEF's own three (`Chin Tuck – Supine`, `Chin Tuck – Standing (Wall-Assisted)`, `Deep Neck Flexor Hold – Progression`), none filmed. |
| **suboccipitals** (tight, Forward Head) | Needs sustained upper-cervical pressure or an active chin glide. MEF has three (two ball releases and a chin glide), none filmed. Candidates #5 and #6 are generic neck range of motion, which is a different thing. |
| **thoracic extensors** (long, Forward Head) | Reclassifiable in principle via candidates #7 to #9, but every one of them is a prone lumbar-dominant extension rather than the segmental thoracic work MEF's own `Prone Y Raise`, `Prone T Raise` and `Wall Angels` were written for. Treat as zero until either a video exists or Osei accepts #9. |
| **levator scapulae** (tight, Upper Cross) | Candidates #3 and #4 partially cover it. MEF's own three levator exercises are unfilmed. |
| **TFL** (tight, Lower Cross) | Release stays at zero regardless: MEF's `Foam Roll – TFL / IT Band` is the only TFL release in the system and it has no video. Mobility can be covered by candidate #2. |
| **every Release slot, all four blueprints** | See section 1. One assignable release exercise exists and it names no muscle. Candidate #1 fixes part of this with no new video; the rest needs the eleven MEF foam-roll and ball-release exercises filmed. |

**Therefore: Forward Head stays unavailable as a complete program until deep
neck flexor and suboccipital videos are recorded.** Its Stability block is
empty at every severity, and that is now stated on the coach screen rather than
left for a coach to notice.

---

## 4. What to record first, if the point is to unblock the most

1. The three deep neck flexor exercises. They alone unblock Forward Head's
   Stability block and half of Upper Cross's.
2. The eleven foam-roll and ball-release exercises. They restore the Release
   block for all four blueprints.
3. `Prone Y Raise`, `Prone T Raise`, `Wall Angels`. They cover thoracic
   extensors and serratus anterior properly rather than by approximation.
4. The three suboccipital and three levator scapulae exercises.

That is 20 of the 28 MEF-authored exercises. All 28 become assignable
automatically the moment `has_video` is true for them; no code change, no
migration, no redeploy.
