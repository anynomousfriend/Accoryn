import {
  RESEARCH_HANDOFF,
  researchGrant,
} from "../engines/app/research-session.ts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SiteHeader, Button, ActionLink } from "../design/primitives.tsx";
import { ObjectRegistrationController } from "./controller.ts";
import { CapturePanel } from "./CapturePanel.tsx";
import type { Comparison, ObjectTemplate } from "./types.ts";
import { ComparisonResult } from "./ComparisonResult.tsx";
import { TemplateStore } from "./template-store.ts";
import { memberTemplateKey } from "../engines/app/member-object.ts";
export type MemberObjectOptions = {
  vaultId: string;
  accountId: string;
  approval: boolean;
  onTemplate: (template: ObjectTemplate | null) => void;
  onComparisonReset: () => void;
  onAcknowledge: (
    template: ObjectTemplate,
    comparison: Comparison,
    comparedAt: number,
  ) => void;
};
export default function ObjectRegistrationPage({
  member,
  registrationController,
}: {
  member?: MemberObjectOptions;
  registrationController?: ObjectRegistrationController;
} = {}) {
  const [controller] = useState(
    () =>
      registrationController ??
      new ObjectRegistrationController(
        member
          ? new TemplateStore(
              memberTemplateKey(member.vaultId, member.accountId),
            )
          : undefined,
      ),
  );
  const callbacks = useRef(member);
  callbacks.current = member;
  const comparedAt = useRef(0);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [consentedComparison, setConsentedComparison] =
    useState<Comparison | null>(null);
  const researchConsent =
    !!state.comparison && consentedComparison === state.comparison;
  const [label, setLabel] = useState("");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comparisonExpired, setComparisonExpired] = useState(false);
  useEffect(() => {
    callbacks.current?.onTemplate(state.template);
  }, [state.template]);
  useEffect(() => {
    callbacks.current?.onComparisonReset();
    comparedAt.current = state.comparison ? Date.now() : 0;
    setComparisonExpired(false);
    if (!state.comparison) return;
    const timer = setTimeout(() => setComparisonExpired(true), 120_000);
    return () => clearTimeout(timer);
  }, [state.comparison]);
  const attachVideo = useCallback(
    (video: HTMLVideoElement | null) => controller.attachVideo(video),
    [controller],
  );
  useEffect(() => {
    void controller.initialize();
    const hidden = () => {
      if (document.visibilityState === "hidden") controller.cancel();
    };
    window.addEventListener("pagehide", controller.cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", controller.cancel);
      document.removeEventListener("visibilitychange", hidden);
      controller.dispose();
    };
  }, [controller]);
  useEffect(() => {
    setConsentedComparison(null);
    setReplaceConfirmed(false);
    setConfirmDelete(false);
    setLabel("");
  }, [state.template?.id]);
  const busy = [
    "loading",
    "requesting",
    "processing",
    "saving",
    "comparing",
  ].includes(state.phase);
  const inCapture =
    !!state.mode &&
    [
      "loading",
      "requesting",
      "capture",
      "review",
      "processing",
      "comparing",
    ].includes(state.phase);
  const readyToSave =
    state.mode === "enrollment" &&
    state.previews.length === 3 &&
    !state.reviewUrl;
  const error = state.phase === "error";
  const Container = member ? "div" : "main";
  return (
    <>
      {!member && <SiteHeader />}
      <Container
        id={member ? undefined : "main"}
        className={
          member
            ? "member-object space-y-5"
            : "page-shell max-w-4xl py-8 sm:py-12"
        }
      >
        <p className="eyebrow-label">
          {member
            ? "Member object · on-device research"
            : "Feature 02 · Local object research"}
        </p>
        <h2 className="mt-4 font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          {member?.approval
            ? "Your object, before your approval."
            : "Register your object."}
        </h2>
        {member && (
          <p className="break-all text-sm text-muted">
            For {member.accountId} in {member.vaultId}. Each member enrolls on
            their own device.
          </p>
        )}
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
          {member?.approval && state.template
            ? "Compare a fresh view of your enrolled object. Keep the object centered and use similar lighting. This comparison stays on your device."
            : "Start with something distinctive and textured. Capture three views, then compare a new scan. Your object photos stay on this device and are discarded after saving."}
        </p>
        <section
          aria-label="Storage notice"
          className="mt-6 rounded-xl border border-line bg-sky p-4 text-sm leading-6 text-ink"
        >
          <p>
            Save this object's visual template in this browser. Photos are
            discarded.{" "}
            {member
              ? "This adds a local research step to this member’s vault approval flow."
              : "This does not create a wallet."}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            A visual template stays until you delete it or clear browser data.
            It is specific to this browser and device, with no cross-device
            recovery. Photos are not secret keys.
          </p>
        </section>
        <div className="mt-6 rounded-xl border border-line bg-white p-4">
          <p
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={`text-sm leading-6 ${error ? "text-danger" : "text-ink"}`}
          >
            {state.detail}
          </p>
          {state.phase === "loading" && state.mode && (
            <div className="mt-3">
              <label
                htmlFor="model-progress"
                className="block text-xs text-muted"
              >
                Loading image model
              </label>
              <progress
                id="model-progress"
                aria-label="Loading image model"
                className="mt-2 h-2 w-full accent-cobalt"
                max={state.progress?.total ?? undefined}
                value={
                  state.progress?.total ? state.progress.loaded : undefined
                }
              />
              {state.progress?.total && (
                <p className="mt-1 font-mono text-xs text-muted">
                  {(state.progress.loaded / 1e6).toFixed(1)} /{" "}
                  {(state.progress.total / 1e6).toFixed(1)} MB in the current
                  download
                </p>
              )}
            </div>
          )}
        </div>
        {state.template && (
          <section
            aria-label="Saved registration"
            className="mt-5 rounded-xl border border-line bg-white p-5"
          >
            <p className="eyebrow-label">Saved in this browser</p>
            <h2 className="mt-2 break-words font-serif text-2xl text-ink">
              {state.template.label}
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              Three visual vectors saved. No photos stored. This is a research
              registration, not an authenticated account.
            </p>
          </section>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          {!inCapture && (!member?.approval || !state.template) && (
            <Button
              disabled={busy}
              onClick={() => void controller.startEnrollment()}
            >
              {error
                ? "Retry registration"
                : state.template
                  ? "Register a replacement"
                  : "Start registration"}
            </Button>
          )}
          {state.template && !inCapture && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void controller.startComparison()}
            >
              Compare a fresh scan
            </Button>
          )}
          {(state.mode || error) && (
            <Button variant="secondary" onClick={controller.cancel}>
              Stop and discard unsaved views
            </Button>
          )}
          {error && (
            <Button
              variant="quiet"
              disabled={busy}
              onClick={() => void controller.initialize()}
            >
              Retry local storage
            </Button>
          )}
        </div>
        {/* Always mount the video ref before permission resolves; only Start activates it. */}
        <div className={inCapture ? "mt-6" : "hidden"}>
          <CapturePanel
            state={state}
            attachVideo={attachVideo}
            onCapture={() => void controller.capture()}
            onRetake={() => controller.retake()}
            onAccept={() => controller.acceptView()}
          />
        </div>
        {state.previews.length > 0 && (
          <section className="mt-5" aria-label="Accepted views">
            <h2 className="text-sm font-semibold text-ink">
              Accepted views: {state.previews.length} of 3
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {state.previews.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={`Enrollment view ${i + 1}, in memory only`}
                  className="aspect-square w-full rounded-xl border border-line object-cover"
                />
              ))}
            </div>
          </section>
        )}
        {readyToSave && (
          <form
            className="mt-6 rounded-2xl border border-line bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void controller.save(label, replaceConfirmed);
            }}
          >
            <label
              htmlFor="object-label"
              className="block text-sm font-medium text-ink"
            >
              Object label
            </label>
            <input
              id="object-label"
              name="object-label"
              type="text"
              autoComplete="off"
              maxLength={60}
              required
              value={label}
              disabled={busy}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-2 min-h-12 w-full rounded-lg border border-line bg-white px-3 text-base text-ink"
              aria-describedby="object-label-help"
            />
            <p id="object-label-help" className="mt-2 text-xs text-muted">
              Use a non-sensitive label, such as “Blue keychain”.
            </p>
            {state.template && (
              <label className="mt-4 flex min-h-11 items-center gap-3 text-sm leading-6 text-ink">
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(e) => setReplaceConfirmed(e.target.checked)}
                  disabled={busy}
                  className="size-5 shrink-0"
                />
                Replace the existing local registration after saving.
              </label>
            )}
            <p className="mt-4 text-xs leading-5 text-muted">
              Save this object's visual template in this browser. Photos are
              discarded. This does not create a wallet.
            </p>
            <Button
              type="submit"
              className="mt-4"
              disabled={
                busy || !label.trim() || (!!state.template && !replaceConfirmed)
              }
            >
              Save visual template
            </Button>
          </form>
        )}
        {state.comparison && (
          <div className="mt-6">
            {member ? (
              <>
                <h3 className="text-xl font-semibold">
                  Scan compared · identity unproven
                </h3>
                <p className="mt-2 text-sm text-muted">
                  The image model cannot yet reliably decide whether this is the
                  same individual object. Retake if it is wrong; continuing
                  records your research acknowledgement, not verified identity.
                </p>
                <details className="mt-4">
                  <summary className="cursor-pointer py-3 text-sm">
                    View measured similarities
                  </summary>
                  <ComparisonResult comparison={state.comparison} />
                </details>
              </>
            ) : (
              <ComparisonResult comparison={state.comparison} />
            )}
            <div className="my-4 rounded-xl border border-line p-4">
              <p className="text-sm">
                Research continuation: there is no calibrated match/reject
                threshold. You must judge this comparison yourself. This does
                not authenticate you or protect the unencrypted browser wallet
                keys.
              </p>
              <label className="my-3 flex gap-3">
                <input
                  type="checkbox"
                  checked={researchConsent}
                  onChange={(e) => {
                    if (!e.target.checked)
                      callbacks.current?.onComparisonReset();
                    setConsentedComparison(
                      e.target.checked ? state.comparison : null,
                    );
                  }}
                />
                I reviewed the fresh scan and accept a manual research
                continuation.
              </label>
              {(!member || member.approval) && (
                <Button
                  disabled={
                    !researchConsent || !state.template || comparisonExpired
                  }
                  onClick={() => {
                    if (
                      !state.template ||
                      !state.comparison ||
                      !researchConsent
                    )
                      return;
                    if (member) {
                      if (Date.now() - comparedAt.current >= 120_000) {
                        setComparisonExpired(true);
                        return;
                      }
                      member.onAcknowledge(
                        state.template,
                        state.comparison,
                        comparedAt.current,
                      );
                      return;
                    }
                    sessionStorage.setItem(
                      RESEARCH_HANDOFF,
                      JSON.stringify(researchGrant(state.template.id)),
                    );
                    window.location.assign("/treasury/");
                  }}
                >
                  {member
                    ? "Use this research check for this payment"
                    : "Continue to testnet account"}
                </Button>
              )}
              {comparisonExpired && (
                <p className="mt-3 text-sm text-warning">
                  This comparison expired. Scan again before continuing.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => void controller.startComparison()}>
                Scan again
              </Button>
              <Button
                variant="secondary"
                onClick={() => void controller.startComparison()}
              >
                Try another object
              </Button>
            </div>
          </div>
        )}
        {(state.template || error) && !member?.approval && (
          <section className="mt-6 rounded-xl border border-line p-4">
            {confirmDelete ? (
              <>
                <h2 className="font-semibold text-ink">
                  Delete this registration?
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  The visual template will be removed from this browser. You
                  will need to capture three views to register again.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setConfirmDelete(false);
                      void controller.deleteRegistration();
                    }}
                  >
                    Yes, delete registration
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep registration
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="quiet"
                disabled={busy || inCapture}
                onClick={() => setConfirmDelete(true)}
              >
                Delete registration
              </Button>
            )}
          </section>
        )}
        <p className="mt-6 text-xs leading-5 text-muted">
          The angle prompts guide capture; they do not prove a 3D object or
          prevent screen/print replay. We will test those limitations before
          considering object-based account access.
        </p>
        <div className="mt-8 border-t border-line pt-5">
          {!member && (
            <ActionLink href="/treasury/" variant="secondary">
              Open team treasury
            </ActionLink>
          )}
          <ActionLink
            href="/device-check/"
            variant="quiet"
            target={member ? "_blank" : undefined}
            rel={member ? "noreferrer" : undefined}
          >
            Back to device checks
          </ActionLink>
        </div>
      </Container>
    </>
  );
}
