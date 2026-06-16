import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoScrollOptions {
  isPlaying: boolean;
  currentTime: number;
  isEnabled?: boolean;
}

/**
 * Custom hook to handle auto-scrolling to keep the currently playing segment centered
 * while respecting user interactions
 */
export function useAutoScroll({ isPlaying,  isEnabled = true }: UseAutoScrollOptions) {
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAutoScrollTimeRef = useRef<number>(0);
  const previousSegmentIdRef = useRef<string | null>(null);

  // Detect user scroll interactions
  const handleUserScroll = useCallback(() => {
    const now = Date.now();
    const timeSinceLastAutoScroll = now - lastAutoScrollTimeRef.current;

    // If this scroll happened more than 100ms after our last auto-scroll,
    // it's likely a user-initiated scroll
    if (timeSinceLastAutoScroll > 100) {
      setIsUserScrolling(true);
      lastScrollTimeRef.current = now;

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Resume auto-scroll after 3 seconds of no scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 3000);
    }
  }, []);

  // Attach scroll listener to the container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleUserScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', handleUserScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleUserScroll]);

  // Detect user interactions that should pause auto-scroll
  useEffect(() => {
    const handleUserInteraction = () => {
      setIsUserScrolling(true);
      lastScrollTimeRef.current = Date.now();

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 3000);
    };

    // Listen for mouse and touch interactions
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('mousedown', handleUserInteraction);
    container.addEventListener('touchstart', handleUserInteraction);
    container.addEventListener('wheel', handleUserInteraction, { passive: true });

    return () => {
      container.removeEventListener('mousedown', handleUserInteraction);
      container.removeEventListener('touchstart', handleUserInteraction);
      container.removeEventListener('wheel', handleUserInteraction);
    };
  }, []);

  // Reset user scrolling state when playback stops
  useEffect(() => {
    if (!isPlaying) {
      setIsUserScrolling(false);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    }
  }, [isPlaying]);

  // Scroll to active segment
  const scrollToActiveSegment = useCallback((segmentId: string) => {
    if (!isEnabled || !isPlaying || isUserScrolling) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    // Only scroll if the segment has changed
    if (previousSegmentIdRef.current === segmentId) {
      return;
    }

    const activeElement = container.querySelector(`[data-segment-id="${segmentId}"]`);
    if (!activeElement) return;

    previousSegmentIdRef.current = segmentId;
    lastAutoScrollTimeRef.current = Date.now();

    // Calculate the position to center the element
    const containerRect = container.getBoundingClientRect();
    const elementRect = activeElement.getBoundingClientRect();
    
    const containerCenter = containerRect.top + containerRect.height / 2;
    const elementCenter = elementRect.top + elementRect.height / 2;
    const scrollOffset = elementCenter - containerCenter;

    // Smooth scroll to center the active segment
    container.scrollBy({
      top: scrollOffset,
      behavior: 'smooth'
    });
  }, [isEnabled, isPlaying, isUserScrolling]);

  // Helper function to generate segment ID from index
  const getSegmentId = useCallback((segmentIndex: number) => {
    return `segment-${segmentIndex}`;
  }, []);

  return {
    scrollContainerRef,
    scrollToActiveSegment,
    getSegmentId,
    isAutoScrollEnabled: isEnabled && isPlaying && !isUserScrolling,
  };
}

