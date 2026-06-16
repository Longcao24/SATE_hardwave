import React from 'react';

const MessageControls: React.FC = () => {
  return (
    <div className="message-controls opacity-0 group-hover:opacity-100 absolute right-2 top-2 flex gap-1">
      <button 
        className="message-edit p-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600" 
        data-action="edit" 
        title="Edit transcript"
      >
        <i className="material-icons" style={{ fontSize: '16px' }}>edit</i>
      </button>
      <button 
        className="message-copy p-1 rounded-full bg-green-50 hover:bg-green-100 text-green-600" 
        data-action="copy" 
        title="Copy text"
      >
        <i className="material-icons" style={{ fontSize: '16px' }}>content_copy</i>
      </button>
      <button 
        className="message-delete p-1 rounded-full bg-red-50 hover:bg-red-100 text-red-600" 
        data-action="delete" 
        title="Delete"
      >
        <i className="material-icons" style={{ fontSize: '16px' }}>delete</i>
      </button>
    </div>
  );
};

export default MessageControls; 