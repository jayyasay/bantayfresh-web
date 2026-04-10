import BrandMark from "../components/BrandMark";

type AuthCallbackPageProps = {
  isError?: boolean;
};

export default function AuthCallbackPage({ isError = false }: AuthCallbackPageProps) {
  return (
    <div className="auth-callback-page">
      <div className="auth-callback-card">
        <div className="auth-callback-mark">
          <BrandMark showFrame={false} fillParent />
        </div>
        <p className="auth-callback-eyebrow">BantayFresh</p>
        <h1 className="auth-callback-title">
          {isError ? "Couldn’t complete sign in" : "Completing Google sign-in"}
        </h1>
        <p className="auth-callback-body">
          {isError
            ? "We couldn’t finish restoring your session. Please go back to the sign-in page and try again."
            : "Please wait a moment while we finish signing you in."}
        </p>
        {isError ? (
          <a className="auth-callback-link" href="/">
            Back to Sign In
          </a>
        ) : (
          <div className="auth-callback-spinner" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
