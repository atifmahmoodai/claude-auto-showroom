import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="container section">
      <div className="card empty">
        <h1>Page not found</h1>
        <p className="muted">The page you're looking for doesn't exist.</p>
        <Link className="btn btn-primary" to="/">
          Back to home
        </Link>
      </div>
    </div>
  );
}
