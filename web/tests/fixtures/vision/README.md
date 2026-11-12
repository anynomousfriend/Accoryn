# Computational-only object photographs

These are real camera frames from Google's **Objectron** dataset, not generated images or a simulated browser camera. Source repository revision: `46daaa0aca5b2e704bbc8deb99b0863bc9bf19a7`. Dataset authors: Adel Ahmadyan, Liangkai Zhang, Jiabei Wei, Artsiom Ablavatski, Chuo-Ling Chang, Google Research, *Objectron: A Large Scale Dataset of Object-Centric Videos in the Wild with Pose Annotations* (CVPR 2021). [Official dataset](https://github.com/google-research-datasets/Objectron).

Data is provided under **Computational Use of Data Agreement v1.0**, included as `Objectron-C-UDA-1.0.txt`. These frames are distributed only for computational model testing under that agreement; downstream recipients must comply with the included agreement and retain this attribution. They are not app artwork, demo-user enrollments or production assets. The app build excludes this directory.

| Fixture | Source clip (Google Cloud Storage) | Frame time (seconds) | Purpose |
|---|---|---:|---|
| cup-a-0.jpg | https://storage.googleapis.com/objectron/videos/cup/batch-1/0/video.MOV | 0.325 | Enrollment view |
| cup-a-1.jpg | same cup clip | 1.300 | Enrollment view |
| cup-a-2.jpg | same cup clip | 2.600 | Enrollment view |
| cup-a-heldout.jpg | same cup clip | 4.225 | Held-out view within the same clip |
| cup-b.jpg | https://storage.googleapis.com/objectron/videos/cup/batch-1/1/video.MOV | 0.808 | Different cup, same category |
| bottle.jpg | https://storage.googleapis.com/objectron/videos/bottle/batch-1/0/video.MOV | 5.558 | Different category |

Extraction: native Chrome video decoding; center square of each source frame, resized to 512×512 and encoded as JPEG at quality 0.9. Distinct timestamps are actual different photographs, not rotated/augmented copies. They still share a capture session and background; held-out here does **not** mean an independent capture session. The distractors have different backgrounds, so scores cannot establish foreground-only discrimination. Physical independent captures, similar-looking instances and screen/print presentations remain manual tests. No acceptance threshold is calibrated on these fixtures.
