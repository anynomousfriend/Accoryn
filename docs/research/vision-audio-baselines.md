# Vision and acoustic baselines

Research date: 2026-11-12. Status update 2026-11-13: DINOv2-small q8/WASM is now integrated for local registration and score-only fresh-scan comparison; no acoustic data codec or account authorization is installed. See ../testing/feature-02-object-registration.md for measured evidence and ../../CONTEXT_1.md / ../../CONTEXT_2.md for current ownership. The experiments below are recommendations; challenger models and authorization thresholds are not implemented.

## Object instance verification

Start with **DINOv2 ViT-S/14** features as the baseline. The official model family includes this small backbone. Use it to compare foreground captures of the enrolled physical object; a category label such as “pen” is not sufficient. [Official implementation and weights](https://github.com/facebookresearch/dinov2).

The proposed pipeline is guided multi-angle enrollment, quality rejection, foreground-focused features and a calibrated accept/retry/reject decision. Keep separate enrollment, calibration and held-out capture sessions. Compare different-category items, similar pens, identical-model objects, background changes, screen/print presentations and target phones/laptops. Report genuine and wrong-object acceptance counts, not a general “accuracy” percentage.

Evaluate **DINOv3 ViT-S/16** as a challenger on the same data rather than assume the newer model solves instance authentication. [Official DINOv3 models](https://github.com/facebookresearch/dinov3).

If global features admit similar objects, evaluate a local-feature extractor plus **LightGlue**, which matches keypoints/descriptors between images. Adding this stage must improve held-out false acceptance enough to justify its latency. Textureless objects may remain unsuitable. [Official LightGlue implementation](https://github.com/cvg/LightGlue).

For a browser deployment, evaluate an appropriate ONNX export in a worker, with WebGPU where available and a measured WASM path. Verify numerical/quantization behavior, model/license provenance and cold download cost before selecting an artifact. Do not install or promise a specific converted checkpoint before that evaluation. [Transformers.js browser runtime documentation](https://huggingface.co/docs/transformers.js/en/index).

No visual model supplies a cryptographic secret, trusted camera input or proof that a copied object image is legitimate. The object-only research key-custody/recovery design remains a separate functional decision; this recommendation adds no passkey or external hardware.

## Data over sound

Use **ggwave** as the first codec to benchmark. It provides FSK, Reed–Solomon correction, browser examples and documented 8–16-byte/second throughput. Its ultrasonic-labelled protocol starts at 15 kHz, so universal inaudibility must not be claimed. [Official ggwave documentation](https://github.com/ggerganov/ggwave).

Send a short fresh challenge identifier over sound. Bind its authoritative record to the network, treasury, proposal content, participants, nonce and expiry. Send larger signed responses through the ordinary authenticated session channel; sound alone is neither consent nor encryption. Decide the exact packet and signer/attestation model in the acoustic feature's design.

Evaluate sample-rate handling, clipping, noise, device/browser processing, packet length, retry limits and one-at-a-time response rounds. Keep DSP work from blocking the interface. Measure complete two-device success, retries and p50/p95 session latency on physical hardware; codec encode/decode tests are not a physical channel test. Test replay, mutation, expiry, incorrect participants and live relay independently of decoding quality.

Quiet.js is a comparison candidate, but its published browser table contains outdated platform assumptions. That table cannot establish current device support or superiority. A custom chirp/OFDM modem adds implementation and verification work; pursue it only after a measured codec limitation justifies it. [Quiet.js documentation](https://github.com/quiet/quiet-js).

Near-ultrasonic operation must be tested on each device pair. If it fails, show an unsupported/retry result. Any audible transport alternative needs an explicit product policy and visible choice, not a silent relaxation of the promised mode. A completed exchange is evidence of communication, not unrelayable distance or distinct-human presence.

## Selection gate

Keep the adapters swappable. Finalize a model and audio mode using real capture/device results, reproducible versions and documented failure cases after the current UI release and physical-readiness acceptance. No benchmark or security guarantee is claimed by this baseline note.
