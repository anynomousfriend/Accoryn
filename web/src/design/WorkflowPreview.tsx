import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Radio, ScanLine } from "lucide-react";

export function PaymentFacts({
  recipient,
  amount,
  purpose,
}: {
  recipient: string;
  amount: string;
  purpose: string;
}) {
  return (
    <dl className="payment-facts">
      <div>
        <dt>Recipient</dt>
        <dd>{recipient}</dd>
      </div>
      <div>
        <dt>Amount · NEAR testnet</dt>
        <dd className="payment-amount">
          {amount} <small>NEAR</small>
        </dd>
      </div>
      <div>
        <dt>Purpose</dt>
        <dd>{purpose}</dd>
      </div>
    </dl>
  );
}
export function MemberRoster({
  members,
  currentAccount,
}: {
  members: readonly string[];
  currentAccount?: string;
}) {
  return (
    <ul className="member-roster" aria-label="Vault members">
      {members.map((member, i) => (
        <li key={member}>
          <span className="member-avatar" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 break-all">{member}</span>
          {member === currentAccount && (
            <span className="ml-auto text-xs text-muted">You</span>
          )}
        </li>
      ))}
    </ul>
  );
}
export function ApprovalProgress({
  approvals,
  required,
}: {
  approvals: number;
  required: number;
}) {
  return (
    <p className="approval-progress">
      <span>
        {approvals} of {required}
      </span>{" "}
      member approvals
    </p>
  );
}
export function WorkflowPreview({
  chapter,
  children,
}: {
  chapter: "account" | "payment" | "approval";
  children?: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(!document.hidden);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries[0].isIntersecting),
    );
    if (frame.current) observer.observe(frame.current);
    const changed = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);
  return (
    <div
      ref={frame}
      className="workflow-preview"
      data-visible={visible && documentVisible}
    >
      <div className="preview-chrome">
        <span className="preview-mark">◈</span>
        <span>Accoryn</span>
        <span className="ml-auto">Example / testnet</span>
      </div>
      <div className="preview-body" data-preview={chapter} key={chapter}>
        <p className="eyebrow-label">
          {chapter === "account"
            ? "A place for your team"
            : chapter === "payment"
              ? "Every detail, together"
              : "Independent decisions"}
        </p>
        <h3>
          {chapter === "account"
            ? "Your shared vault"
            : chapter === "payment"
              ? "Review the payment"
              : "A shared moment."}
        </h3>
        {chapter === "account" ? (
          <>
            <div
              className="preview-account-sequence"
              aria-label="Example account creation steps"
            >
              <span>
                Choose username <strong>maya.testnet</strong>
              </span>
              <span>Authorize this browser’s signing key</span>
              <span>Account created → open your vault</span>
            </div>
            <div className="preview-balance">
              <span>Studio vault</span>
              <strong>
                12.50 <small>NEAR</small>
              </strong>
              <span>Illustrative balance</span>
            </div>
            <MemberRoster
              members={["maya.testnet", "arjun.testnet"]}
              currentAccount="maya.testnet"
            />
            <p className="preview-note">
              <ScanLine size={16} /> Each member enrolls their own object.
            </p>
          </>
        ) : chapter === "payment" ? (
          <>
            <PaymentFacts
              recipient="supplier.testnet"
              amount="0.05"
              purpose="Studio equipment"
            />
            <p className="preview-note">
              <ArrowUpRight size={16} /> Review before submitting a request.
            </p>
          </>
        ) : (
          <>
            <div className="preview-signal" aria-hidden="true">
              <span />
              <span />
              <span />
              <Radio size={28} />
            </div>
            <ol className="preview-checks">
              <li>
                <Check size={15} /> Object comparison reviewed
              </li>
              <li>
                <Check size={15} /> Acoustic response received
              </li>
              <li>
                <Check size={15} /> Approval recorded
              </li>
            </ol>
            <ApprovalProgress approvals={1} required={2} />
            <p className="preview-note">
              Approval is separate from payment execution.
            </p>
          </>
        )}
        {children}
      </div>
      <div className="preview-foot">
        Illustrative walkthrough · example data
      </div>
    </div>
  );
}
