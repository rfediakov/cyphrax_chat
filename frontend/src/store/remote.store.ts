import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WebRTCSession } from '../lib/webrtc';
import { fetchIceConfig } from '../api/calls.api';
import { socketSingleton } from '../hooks/useSocket';

export type ConsentDuration = 1 | 5;

export interface IncomingViewRequest {
  sessionId: string;
  guardianId: string;
  guardianUsername: string;
}

export interface ActiveViewSession {
  sessionId: string;
  /** true when this user is the guardian watching */
  isGuardian: boolean;
  peerId: string;
  peerUsername: string;
  durationMinutes: ConsentDuration;
  startedAt: number;
  endsAt: number;
  remoteStream: MediaStream | null;
}

interface RemoteState {
  incomingRequest: IncomingViewRequest | null;
  activeSession: ActiveViewSession | null;
  /** Raw WebRTC session kept out of render cycle */
  _session: WebRTCSession | null;
  /** Epoch ms — deny cooldown prevents showing request until expired */
  denyCooldownUntil: number;

  setIncomingRequest: (req: IncomingViewRequest | null) => void;

  /** Child: consent (grant or deny) */
  consentToView: (granted: boolean, duration?: ConsentDuration) => void;

  /** Guardian: triggered when consent_result arrives and granted===true */
  startGuardianSession: (params: {
    sessionId: string;
    targetUserId: string;
    targetUsername: string;
    durationMinutes: ConsentDuration;
  }) => Promise<void>;

  /** Child: triggered when session becomes active (consent granted) */
  startChildSession: (params: {
    sessionId: string;
    guardianId: string;
    guardianUsername: string;
    durationMinutes: ConsentDuration;
  }) => Promise<void>;

  stopSession: () => void;
  setRemoteStream: (stream: MediaStream) => void;
  handleOffer: (sessionId: string, fromUserId: string, sdp: RTCSessionDescriptionInit) => Promise<void>;
  handleAnswer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  handleIce: (candidate: RTCIceCandidateInit) => Promise<void>;
}

async function buildSession(): Promise<WebRTCSession> {
  const { iceServers } = await fetchIceConfig();
  return new WebRTCSession({ iceServers });
}

export const useRemoteStore = create<RemoteState>()(
  persist(
    (set, get) => ({
      incomingRequest: null,
      activeSession: null,
      _session: null,
      denyCooldownUntil: 0,

      setIncomingRequest: (req) => set({ incomingRequest: req }),

      consentToView: (granted, duration = 1) => {
        const { incomingRequest } = get();
        const socket = socketSingleton;
        if (!incomingRequest || !socket) return;

        if (!granted) {
          set({ denyCooldownUntil: Date.now() + 5 * 60 * 1000 });
        }

        socket.emit('remote_view_consent', {
          sessionId: incomingRequest.sessionId,
          granted,
          duration,
        });
        set({ incomingRequest: null });
      },

      startGuardianSession: async ({ sessionId, targetUserId, targetUsername, durationMinutes }) => {
        const socket = socketSingleton;
        if (!socket) return;

        const session = await buildSession();

        session.onRemoteStream((stream) => {
          get().setRemoteStream(stream);
        });

        session.onIceCandidate((candidate) => {
          socket.emit('webrtc_ice', { callId: sessionId, targetUserId, candidate });
        });

        // Guardian only receives — no local media needed. But WebRTC still needs a transceiver.
        // Add a recvonly transceiver so the remote track can be delivered.
        const pc = (session as unknown as { pc: RTCPeerConnection }).pc;
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        const offer = await session.createOffer();
        socket.emit('webrtc_offer', { callId: sessionId, targetUserId, sdp: offer });

        const now = Date.now();
        set({
          _session: session,
          activeSession: {
            sessionId,
            isGuardian: true,
            peerId: targetUserId,
            peerUsername: targetUsername,
            durationMinutes,
            startedAt: now,
            endsAt: now + durationMinutes * 60 * 1000,
            remoteStream: null,
          },
        });
      },

      startChildSession: async ({ sessionId, guardianId, guardianUsername, durationMinutes }) => {
        const session = await buildSession();
        const localStream = await session.startLocalMedia(true, true);

        const socket = socketSingleton;
        if (socket) {
          session.onIceCandidate((candidate) => {
            socket.emit('webrtc_ice', { callId: sessionId, targetUserId: guardianId, candidate });
          });
        }

        // We'll handle the offer from guardian in handleOffer
        const now = Date.now();
        set({
          _session: session,
          activeSession: {
            sessionId,
            isGuardian: false,
            peerId: guardianId,
            peerUsername: guardianUsername,
            durationMinutes,
            startedAt: now,
            endsAt: now + durationMinutes * 60 * 1000,
            remoteStream: null,
          },
        });
        void localStream; // used via session internally
      },

      stopSession: () => {
        const { activeSession, _session } = get();
        const socket = socketSingleton;
        if (activeSession && socket) {
          socket.emit('remote_view_stop', { sessionId: activeSession.sessionId });
        }
        _session?.close();
        set({ activeSession: null, _session: null });
      },

      setRemoteStream: (stream) => {
        const { activeSession } = get();
        if (!activeSession) return;
        set({ activeSession: { ...activeSession, remoteStream: stream } });
      },

      handleOffer: async (sessionId, fromUserId, sdp) => {
        const { _session, activeSession } = get();
        const socket = socketSingleton;
        if (!_session || !socket || !activeSession) return;
        const answer = await _session.acceptOffer(sdp);
        socket.emit('webrtc_answer', { callId: sessionId, targetUserId: fromUserId, sdp: answer });
      },

      handleAnswer: async (sdp) => {
        const { _session } = get();
        if (!_session) return;
        await _session.acceptAnswer(sdp);
      },

      handleIce: async (candidate) => {
        const { _session } = get();
        if (!_session) return;
        await _session.addIceCandidate(candidate);
      },
    }),
    {
      name: 'remote-store',
      partialize: (s) => ({ denyCooldownUntil: s.denyCooldownUntil }),
    },
  ),
);
