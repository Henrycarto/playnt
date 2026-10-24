import { Link } from 'react-router';
import { useTitle } from '../hooks';

export function NotFound({ what = 'page', detail }: { what?: string; detail?: string }) {
  useTitle('Not found');
  return (
    <div style={{ maxWidth: '64ch' }}>
      <h1>No such {what}</h1>
      <p className="sub">{detail ?? 'This address does not match any page in Playnt. Check the link, or start from the queue.'}</p>
      <Link className="btn" to="/">Go to the queue</Link>
    </div>
  );
}
