import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../../utils/canvasUtils';
import './AvatarCropModal.scss';

interface AvatarCropModalProps {
  imageSrc: string;
  onCropComplete: (base64Avatar: string) => void;
  onCancel: () => void;
}

export default function AvatarCropModal({ imageSrc, onCropComplete, onCancel }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = (crop: { x: number; y: number }) => {
    setCrop(crop);
  };

  const onCropCompleteCallback = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    try {
      setIsProcessing(true);
      const base64Avatar = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (base64Avatar) {
        onCropComplete(base64Avatar);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Failed to crop image: ${e.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="crop-modal-overlay" onClick={onCancel}>
      <div className="crop-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Adjust Avatar</h3>
        
        <div className="crop-container">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteCallback}
            onZoomChange={setZoom}
          />
        </div>

        <div className="controls">
          <label>Zoom</label>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-labelledby="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="zoom-slider"
          />
        </div>

        <div className="modal-actions">
          <button className="secondary-btn" onClick={onCancel} disabled={isProcessing}>Cancel</button>
          <button className="primary-btn" onClick={handleSave} disabled={isProcessing}>
            {isProcessing ? 'Saving...' : 'Save Avatar'}
          </button>
        </div>
      </div>
    </div>
  );
}
