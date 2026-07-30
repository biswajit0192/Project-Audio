import { useNavigate } from 'react-router-dom';
import logoMain from '../../assets/logo-main.svg';
import './GetStarted.scss';

export default function GetStarted() {
  const navigate = useNavigate();
  return (
    <div className="main-content">
      {/* Vector Logo Layout */}
      <div className="logo-layout">
        <img src={logoMain} alt="HertzSonic Logo" className="brand-logo" />
      </div>

      {/* Messaging Box */}
      <div className="message-box">
        <h2 className="subtitle">
          Sound, exactly as intended.
        </h2>
        <p className="description">
          A audio player built for your high-fidelity music collection.
        </p>
      </div>

      <button className="btn-primary" onClick={() => navigate('/auth/login')}>
        Get Started &rarr;
      </button>
    </div>
  );
}
