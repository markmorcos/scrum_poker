/**
 * websocket.test.ts - Minimal Unit Tests for WebSocket Service
 * 
 * This test suite provides basic testing of the WebSocketService class
 * without complex mocking that causes timeout issues.
 * 
 * Test Coverage:
 * 1. Service instantiation and basic API
 * 2. Connection state management
 * 3. Event handler registration
 * 4. Message sending error handling
 * 
 * Testing Approach:
 * - Tests the service interface without complex WebSocket mocking
 * - Focuses on API contracts and error handling
 * - Avoids async operations that cause timeouts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketService } from '../../services/websocket';
import { MessageType } from '../../types';

// Simple WebSocket mock that doesn't cause timing issues
global.WebSocket = vi.fn().mockImplementation(() => ({
  readyState: 1, // OPEN
  close: vi.fn(),
  send: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})) as any;

describe('WebSocketService', () => {
  let wsService: WebSocketService;
  let mockConsoleError: any;

  beforeEach(() => {
    wsService = new WebSocketService();
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      wsService.disconnect();
    } catch {
      // Ignore errors during cleanup
    }
  });

  describe('Service Initialization', () => {
    it('should create service instance', () => {
      expect(wsService).toBeInstanceOf(WebSocketService);
    });

    it('should start disconnected', () => {
      expect(wsService.isConnected()).toBe(false);
    });
  });

  describe('Event Handler Management', () => {
    it('should allow registering event handlers', () => {
      const mockHandler = vi.fn();
      
      expect(() => {
        wsService.on(MessageType.JOIN, mockHandler);
      }).not.toThrow();
    });

    it('should allow removing event handlers', () => {
      const mockHandler = vi.fn();
      wsService.on(MessageType.JOIN, mockHandler);
      
      expect(() => {
        wsService.off(MessageType.JOIN);
      }).not.toThrow();
    });

    it('should allow multiple handler types', () => {
      const joinHandler = vi.fn();
      const voteHandler = vi.fn();
      
      expect(() => {
        wsService.on(MessageType.JOIN, joinHandler);
        wsService.on(MessageType.VOTE, voteHandler);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle sending when disconnected', () => {
      const message = {
        type: MessageType.VOTE,
        payload: { userId: 'user-123', estimate: '5' }
      };

      wsService.send(message);
      expect(mockConsoleError).toHaveBeenCalledWith('WebSocket is not connected');
    });

    it('should handle disconnect gracefully when not connected', () => {
      expect(() => {
        wsService.disconnect();
      }).not.toThrow();
    });

    it('should maintain consistent state', () => {
      expect(wsService.isConnected()).toBe(false);
      
      // Should handle multiple disconnects
      wsService.disconnect();
      expect(wsService.isConnected()).toBe(false);
    });
  });

  describe('Service API', () => {
    it('should have all required methods', () => {
      expect(typeof wsService.connect).toBe('function');
      expect(typeof wsService.disconnect).toBe('function');
      expect(typeof wsService.send).toBe('function');
      expect(typeof wsService.on).toBe('function');
      expect(typeof wsService.off).toBe('function');
      expect(typeof wsService.isConnected).toBe('function');
    });

    it('should handle multiple handler registrations', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      wsService.on(MessageType.JOIN, handler1);
      wsService.on(MessageType.VOTE, handler2);
      
      // Should not interfere with each other
      wsService.off(MessageType.JOIN);
      
      expect(() => {
        wsService.on(MessageType.JOIN, handler1);
      }).not.toThrow();
    });

    it('should handle sending with invalid data gracefully', () => {
      expect(() => {
        wsService.send({
          type: MessageType.VOTE,
          payload: null as any
        });
      }).not.toThrow();
    });
  });
}); 
describe('WebSocketService lifecycle', () => {
  it('does not auto-reconnect after an intentional disconnect', async () => {
    const sockets: any[] = [];
    const ctor = vi.fn().mockImplementation(() => {
      const socket: any = { readyState: 1, send: vi.fn() };
      socket.close = vi.fn(() => socket.onclose?.({ code: 1000, reason: '', wasClean: true }));
      sockets.push(socket);
      return socket;
    });
    const original = global.WebSocket;
    global.WebSocket = ctor as any;
    vi.useFakeTimers();
    try {
      const service = new WebSocketService();
      const opened = vi.fn();
      service.onOpen(opened);

      const connecting = service.connect('ws://test');
      sockets[0].onopen();
      await connecting;
      expect(opened).toHaveBeenCalledTimes(1);

      service.disconnect();
      vi.advanceTimersByTime(10000);

      expect(ctor).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      global.WebSocket = original;
    }
  });

  it('sends facilitator actions with the host token', () => {
    const service = new WebSocketService();
    const send = vi.spyOn(service, 'send').mockImplementation(() => {});

    service.sendHostAction(MessageType.SHOW_ESTIMATES, 'happy-panda', 'secret');

    expect(send).toHaveBeenCalledWith({
      type: MessageType.SHOW_ESTIMATES,
      payload: { roomId: 'happy-panda', hostToken: 'secret' },
    });
  });
});
