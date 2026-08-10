import React, { useState, useRef, useEffect } from 'react';
import { updateProfile, deleteUser, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import ProfileIcon from '../../assets/Profile-icon.svg?react';
import AvatarCropModal from './AvatarCropModal';
import './ManageAccount.scss';

interface ManageAccountProps {
  onClose: () => void;
}

export default function ManageAccount({ onClose }: ManageAccountProps) {
  const { user, reloadUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Avatar state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!auth.currentUser || !user) return null;

  const handleUpdateName = async () => {
    if (!displayName.trim() || displayName === user.name) return;
    setIsUpdatingName(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: displayName.trim() });
      await reloadUser();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to update display name: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleResetPasswordClick = () => {
    onClose();
    navigate('/auth/forgot-password');
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteUser(auth.currentUser!);
      window.location.reload(); // Hard reload is appropriate here to clear all states and unmount
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        alert('This sensitive operation requires a recent login. Please sign out and log back in before trying again.');
      } else {
        alert(`Failed to delete account: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || null);
      });
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCropComplete = async (base64Avatar: string) => {
    setImageSrc(null);
    setIsUploading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.displayName) throw new Error("No authenticated user");

      const currentUsername = currentUser.displayName.toLowerCase().trim();
      
      // Update Firestore document with merge
      await setDoc(doc(db, "usernames", currentUsername), { photoURL: base64Avatar }, { merge: true });
      
      await reloadUser();
    } catch (err: any) {
      console.error("Failed to upload avatar", err);
      alert(`Failed to upload avatar: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const providerId = auth.currentUser.providerData[0]?.providerId || 'password';
  const isEmailProvider = providerId === 'password';

  return (
    <div className="manage-account-overlay" onClick={onClose}>
      <div className="manage-account-modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Manage Account</h2>

        <div className="account-sections">
          
          {/* Profile Section */}
          <div className="account-section">
            <h3 className="section-subtitle">PROFILE</h3>
            <div className="profile-row">
              <div 
                className="avatar-edit-wrapper"
                onClick={() => !isUploading && fileInputRef.current?.click()}
                title="Change Avatar"
              >
                {user.avatar ? (
                  <img 
                    src={user.avatar} 
                    alt="Avatar" 
                    className="avatar-large" 
                    style={{ opacity: isUploading ? 0.5 : 1 }}
                  />
                ) : (
                  <ProfileIcon 
                    className="avatar-large" 
                    style={{ opacity: isUploading ? 0.5 : 1 }}
                  />
                )}
                <div className="edit-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </div>
                {isUploading && (
                  <div className="loading-overlay"><span>...</span></div>
                )}
              </div>
              <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileChange} />
              
              <div className="name-edit-group">
                <span className="name-label">Display Name</span>
                <div className="name-input-row">
                  <input 
                    type="text" 
                    className="account-input" 
                    value={displayName} 
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display Name"
                  />
                  <button 
                    className="save-btn" 
                    onClick={handleUpdateName}
                    disabled={isUpdatingName || !displayName.trim() || displayName === user.name}
                  >
                    {isUpdatingName ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Security & Info */}
          <div className="account-section">
            <h3 className="section-subtitle">ACCOUNT & SECURITY</h3>
            
            <div className="card-row">
              <span className="row-label">{auth.currentUser.email}</span>
              {auth.currentUser.emailVerified ? (
                <span className="badge verified">VERIFIED</span>
              ) : (
                <span className="badge unverified">UNVERIFIED</span>
              )}
            </div>

            {isEmailProvider && (
              <div className="card-row">
                <span className="row-label">Password</span>
                <button className="action-link-btn" onClick={handleResetPasswordClick}>Reset Password</button>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="account-section danger-zone-section">
            <h3 className="section-subtitle">DANGER ZONE</h3>
            <div className="danger-actions-row">
              <button className="ghost-btn signout" onClick={() => { onClose(); signOut(auth); }}>Sign Out</button>
              
              {!showDeleteConfirm ? (
                <button className="ghost-btn danger" onClick={() => setShowDeleteConfirm(true)}>Delete Account</button>
              ) : (
                <div className="delete-confirm-inline">
                  <span className="confirm-text">Are you sure?</span>
                  <button className="ghost-btn cancel-btn" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                  <button className="ghost-btn danger-filled" onClick={handleDeleteAccount}>Yes, Delete</button>
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="modal-footer">
          <button className="done-btn" onClick={onClose}>Done!</button>
        </div>
      </div>

      {imageSrc && (
        <AvatarCropModal
          imageSrc={imageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => setImageSrc(null)}
        />
      )}
    </div>
  );
}
