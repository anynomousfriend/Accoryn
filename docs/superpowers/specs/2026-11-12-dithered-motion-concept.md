# Dithered motion concept

Status: proposed response to the user's rejection of the first visual direction. This supersedes the smooth-frame/soft-object artwork direction, not the software-only product constraints. No new concept code has been built yet.

## Intent

Make the landing experience feel distinctive, abstract and interactive. The user specifically requested dithered patterns, stronger animation and scroll-driven storytelling, and rejected the generic smooth SVG artwork and basic page composition. The next deliverable is a small working visual concept: one hero and one continuous scroll sequence. It must be seen in motion before extending it across the page.

## Approaches

- **Procedural artwork — recommended builder call.** A custom browser-rendered dithered field can respond to scrolling, pointer movement and touch. One visual changes meaning across the narrative. This gives direct interaction and avoids another set of disconnected decorative assets. Rendering quality and mobile cost need to be tested in the concept.
- **Prerendered artwork/video.** Easier to art-direct a highly polished fixed scene, but less responsive to input and potentially heavier to load/scrub. Useful as a later fallback if the procedural approach does not meet the visual/performance bar; not the first choice for the requested interactivity.

## What the concept shows

Working headline: **On the same wavelength.** Supporting copy identifies shared treasury approvals, rather than leaving the product abstract. Keep a visible research-prototype label. Final product name remains undecided.

1. **Hero:** a large, dimensional dithered surface, with interference patterns, variable dot density, fine grain and cobalt/coral lighting on an ink field. Bold typographic composition rather than a rounded illustration card. Pointer movement changes the viewpoint slightly; touch can produce a bounded response without taking over page scrolling. Text sits on a reliably readable area.
2. **Scroll chapter 1 — Something personal:** separated clusters form an abstract object impression. The text explains the planned personal-object access experiment. It does not show a fake enrolled credential or imply an image is a cryptographic secret.
3. **Scroll chapter 2 — A shared signal:** the same field stretches into interference bands between independent endpoints. Scrolling changes its structure, not just its opacity. This illustrates the proposed acoustic exchange, not a live microphone or a proof of physical distance.
4. **Scroll chapter 3 — A clear decision:** the bands align into an ordered composition while the message changes to independent consent and a shared proposal. This is an illustrated workflow, not a successful payment. No invented balances, members, transaction hashes or approval counts.

Text sketch:

```text
HERO                     SCROLL STORY (one evolving scene)
Working wordmark         01 personal clusters
On the same              ↓
wavelength.              02 interference bands
Short product sentence   ↓
Real device-check CTA    03 ordered agreement field
Large dithered field     Text/scene remain visibly related
```

## Visual and interaction rules

- Retain a coherent cobalt/ink/coral identity, with light reading surfaces where needed. Semantic green still means a genuine confirmed state in functional screens.
- Replace smooth decorative rings, soft blob assets and repeated rounded feature panels. Use scale, negative space, stronger type and varied editorial composition.
- Build the scene from original procedural geometry/texture. No stock coins, padlocks, hardware-token imagery or copied reference artwork. SVG may remain for small functional icons; it is not the centerpiece art direction.
- Let the browser scroll normally. No scroll hijacking, forced auto-scroll, mandatory dragging or prolonged loading intro. Visible actions work immediately.
- The first concept proves hero interaction, the three scene transformations and phone/laptop composition. Avoid spending the whole build on a generic engine or a full-page rewrite before the artwork is judged.
- On mobile, simplify the field and shorten sticky exposure; preserve legibility and native vertical touch scrolling. On reduced motion, present stable chapter compositions with immediate navigation. Static content remains complete if rendering is unavailable.
- Stop rendering when hidden/offscreen. Cap rendering resolution/complexity and profile on a phone before claiming smoothness. An interactive canvas is the preferred starting medium; exact renderer choice and scene mathematics are builder calls.
- Do not put decorative scene movement behind camera controls or future payment decisions. Real amounts, recipients, status text and action targets remain stable.

## Delivery order

1. Produce the labelled visual concept and show its live URL plus a short visible capture early. Keep the current functional checks accessible.
2. Let the user judge the artwork and motion. Functional acceptance is still pending; this does not advance wallet, model, sound-codec or payment work.
3. If the user accepts the concept, extend its visual language across the landing sections and app framing, with focused browser tests and the existing real-device regression suite.

This is a proposed visual experiment. It is not a new approval of the earlier rejected style, nor a claim that the acoustic or wallet functions are implemented. Repository creation/pushing still waits for the user's chosen name and new shared repository.
