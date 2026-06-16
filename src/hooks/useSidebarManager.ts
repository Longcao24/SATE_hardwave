import { useState, useEffect } from 'react';

export function useSidebarManager() {
  // UI state
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(true);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarVisible, setRightSidebarVisible] = useState(true);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Sidebar width state
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320); // Default 320px (w-80)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320); // Default 320px (w-80)
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  
  // Category expansion state
  const [categoryExpanded, setCategoryExpanded] = useState<{[key: string]: boolean}>({});

  // Handle sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(240, Math.min(480, e.clientX));
        setLeftSidebarWidth(newWidth);
      } else if (isResizingRight) {
        const newWidth = Math.max(240, Math.min(480, window.innerWidth - e.clientX));
        setRightSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizingLeft || isResizingRight) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

  // Keyboard shortcuts for sidebars
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmd + B: Toggle left sidebar collapse
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setLeftSidebarCollapsed(prev => !prev);
      }

      // Ctrl/Cmd + /: Toggle right sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setRightSidebarVisible(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleCategory = (category: string) => {
    setCategoryExpanded(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return {
    // State
    leftSidebarVisible,
    leftSidebarCollapsed,
    rightSidebarVisible,
    rightSidebarCollapsed,
    activeTab,
    leftSidebarWidth,
    rightSidebarWidth,
    isResizingLeft,
    isResizingRight,
    categoryExpanded,
    
    // Actions
    setLeftSidebarVisible,
    setLeftSidebarCollapsed,
    setRightSidebarVisible,
    setRightSidebarCollapsed,
    setActiveTab,
    setIsResizingLeft,
    setIsResizingRight,
    toggleCategory,
  };
}
