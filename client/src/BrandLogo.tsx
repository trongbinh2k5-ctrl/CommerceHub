import { Link } from 'react-router-dom';

export function BrandLogo() {
  return <Link to="/" className="wordmark berylcore-logo" aria-label="BerylCore trang chủ">
    <img className="berylcore-symbol" src="/brand/berylcore-symbol.svg" width="36" height="36" alt="" aria-hidden="true"/>
    <span className="wordmark-name">Beryl<span className="brand-core">Core</span></span>
  </Link>;
}
