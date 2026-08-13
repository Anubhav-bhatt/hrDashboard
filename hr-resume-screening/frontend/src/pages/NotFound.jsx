import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, EmptyState } from '../components/ui';

/**
 * Catch-all route. Without this, an unknown URL rendered a blank page and React
 * Router logged "No routes matched location".
 */
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="py-8">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description={`Nothing exists at ${location.pathname}. It may have been moved, or the link may be incomplete.`}
        action={
          <>
            <Link to="/" className="btn btn-sm btn-primary">
              Go to dashboard
            </Link>
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
              Go back
            </Button>
          </>
        }
        className="max-w-lg mx-auto"
      />
    </div>
  );
};

export default NotFound;
