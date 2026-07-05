# FIX 04 — RTMPose output is decoded wrong (skeletons are garbage)

**Priority:** 4 (do after FIX_03 — data must be flowing to see this)
**Apps touched:** `apps/pose-service` (`inference.py`)
**Depends on:** FIX_03 (workers running).

---

## 1. Symptom

Once workers run (FIX_03), skeleton keypoints are either empty or land in nonsensical
positions (clustered near a corner, jittering) regardless of where the person is. The
overlay does not track the body.

## 2. Root cause (with evidence)

`apps/pose-service/inference.py` → `RTMPoseAdapter` decodes the model output **incorrectly**
for RTMPose. Two problems:

**A. Wrong output format assumption.** `_postprocess` assumes the ONNX output is shaped
`(1, 17, 3)` = `[x, y, score]` per joint:
```python
raw_x, raw_y, score = float(kps[i][0]), float(kps[i][1]), float(kps[i][2])
```
RTMPose does **not** output coordinates. It uses **SimCC** (coordinate classification):
it emits **two** tensors — `simcc_x` of shape `(1, 17, W*split)` and `simcc_y` of shape
`(1, 17, H*split)` — which are 1-D probability distributions per keypoint. You get a
coordinate by taking the **argmax** of each and dividing by the split ratio (2.0). The
current code reads the first three probability bins of `simcc_x` as if they were x/y/score
→ garbage.

**B. Wrong preprocessing normalization.** `_preprocess` uses
`blobFromImage(scalefactor=1/255, swapRB=True)` — plain 0–1 scaling. RTMPose was trained
with **ImageNet mean/std** normalization on RGB. Wrong normalization shifts every
keypoint.

(For contrast, the `YOLOPoseAdapter` in the same file is decoded **correctly** — so
switching `POSE_MODEL_TYPE=yolo` is a valid fast path if a YOLO-Pose ONNX is available.)

**This is the exact SimCC decode we already implemented** in the standalone
`pose_rtmpose.py` script earlier in the project — port that logic here.

## 3. The fix

Rewrite `RTMPoseAdapter` preprocessing and postprocessing.

### 3a. Correct preprocessing (ImageNet mean/std, RGB, CHW)

```python
MEAN = np.array([123.675, 116.28, 103.53], dtype=np.float32)
STD  = np.array([58.395, 57.12, 57.375], dtype=np.float32)

def _preprocess(self, frame: np.ndarray) -> np.ndarray:
    h, w = self._input_size            # (256, 192) = (H, W)
    resized = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32)
    rgb = (rgb - self.MEAN) / self.STD
    blob = rgb.transpose(2, 0, 1)[None]   # (1, 3, H, W)
    return np.ascontiguousarray(blob, dtype=np.float32)
```

> Note: this resizes the **whole frame**. RTMPose is a top-down model that expects a
> person crop; for a single, roughly-centered subject (the pole-fitness use case) a full
> frame works acceptably. If accuracy on off-center/multi-person is needed later, add a
> person detector and top-down affine crop (see the standalone `pose_rtmpose.py` for the
> `top_down_affine` helper). Keep that as a follow-up, not part of this fix.

### 3b. Correct SimCC decode

The model now returns **two** outputs. Identify them by last-dim size and decode:

```python
SIMCC_SPLIT_RATIO = 2.0

def _decode_simcc(self, simcc_x: np.ndarray, simcc_y: np.ndarray) -> PoseResult:
    # shapes: simcc_x (1, K, W*split), simcc_y (1, K, H*split)
    N, K, _ = simcc_x.shape
    x = simcc_x.reshape(N * K, -1)
    y = simcc_y.reshape(N * K, -1)
    x_locs = np.argmax(x, axis=1).astype(np.float32)
    y_locs = np.argmax(y, axis=1).astype(np.float32)
    max_x = np.amax(x, axis=1)
    max_y = np.amax(y, axis=1)
    scores = np.minimum(max_x, max_y)

    # argmax bin -> input-pixel coords
    x_locs /= SIMCC_SPLIT_RATIO
    y_locs /= SIMCC_SPLIT_RATIO

    in_h, in_w = self._input_size  # (256, 192)
    keypoints: list[KeypointResult] = []
    kept: list[float] = []
    for i, name in enumerate(COCO_KEYPOINT_NAMES):
        score = float(scores[i])
        # normalize to [0,1] in the model input frame
        nx = float(min(max(x_locs[i] / in_w, 0.0), 1.0))
        ny = float(min(max(y_locs[i] / in_h, 0.0), 1.0))
        if score >= settings.min_confidence:
            keypoints.append(KeypointResult(name=name, x=nx, y=ny, score=score))
            kept.append(score)
    return PoseResult(keypoints=keypoints, confidence_avg=float(np.mean(kept)) if kept else 0.0)
```

And in `infer`, route the two outputs correctly (order can vary between exports — detect by
size):

```python
def infer(self, frame: np.ndarray) -> PoseResult:
    if self._session is None:
        return PoseResult()  # stub mode (model missing)
    blob = self._preprocess(frame)
    input_name = self._session.get_inputs()[0].name
    outputs = self._session.run(None, {input_name: blob})
    if len(outputs) < 2:
        logger.error("RTMPose expected 2 SimCC outputs, got %d", len(outputs))
        return PoseResult()
    a, b = outputs[0], outputs[1]
    in_h, in_w = self._input_size
    # simcc_x last dim == W*split, simcc_y last dim == H*split
    if a.shape[-1] == round(in_w * SIMCC_SPLIT_RATIO):
        simcc_x, simcc_y = a, b
    else:
        simcc_x, simcc_y = b, a
    return self._decode_simcc(simcc_x, simcc_y)
```

Delete the old `(17,3)`-based `_postprocess`.

### 3c. Confirm the input size matches the model

`self._input_size = (256, 192)` is `(H, W)` and matches the standard rtmpose-s export. If
your ONNX reports a different input shape (`session.get_inputs()[0].shape` → `[1,3,H,W]`),
read it from the model at load time instead of hardcoding, and use those H/W consistently
in preprocess + decode.

## 4. Files to touch

- [ ] `apps/pose-service/inference.py` — rewrite `RTMPoseAdapter._preprocess`, add
  `_decode_simcc`, rewrite `infer`, delete old `_postprocess` (**required**)

## 5. Verification

1. With FIX_03 running, watch a `pose:update` payload in the browser (Network → WS) while a
   person moves. Keypoint `x`/`y` (normalized 0–1) should **track the body** — raise an arm
   and `left_wrist`/`right_wrist` y should change accordingly.
2. `confidenceAvg` should be reasonable (e.g. > 0.4 for a clearly visible person), not ~0.
3. The `SkeletonOverlay` visibly follows the person, not stuck in a corner.
4. Quick offline sanity check: feed one saved frame through `RTMPoseAdapter.infer` in a
   Python REPL and print keypoints; nose should sit near the head, ankles near the feet.
5. `pnpm`/pytest for the pose-service if tests exist; otherwise the manual check above.

## 6. Do NOT touch

- Keep the `PoseModelAdapter` interface and the `{keypoints, confidence}` output contract
  unchanged (no scoring/quality fields).
- Don't alter `worker.py`'s sampling/publishing — the bug is only in decode/normalize.
- Don't change the COCO-17 name order — it must match `COCO_KEYPOINT_NAMES`.

## 7. Acceptance criteria

- RTMPose keypoints track the subject accurately and are normalized to [0,1].
- Two-output SimCC decode is handled regardless of output order.
- Overlay follows the body; confidence is realistic.
