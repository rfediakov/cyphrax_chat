import { create } from 'zustand';
import { WebRTCSession } from '../lib/webrtc';
import { fetchIceConfig } from '../api/calls.api';
import { socketSingleton } from '../hooks/useSocket';

export type CallType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined';

export interface IncomingCall {
  callId: string;
  callerId: string;
  callerUsername: string;
  type: CallType;
  /** Dialog or room context */
  roomId?: string;
  calleeId?: string;
}

export interface ActiveCall {
  callId: string;
  type: CallType;
  /** Remote peer user ID */
  peerId: string;
  peerUsername: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  videoOff: boolean;
  startedAt: number; // epoch ms
  /** true when this client is the caller */
  isCaller: boolean;
}

interface CallsState {
  incomingCall: IncomingCall | null;
  activeCall: ActiveCall | null;
  /** Raw WebRTC session — kept out of React render cycle */
  _session: WebRTCSession | null;

  /** Called by useSocket when call_incoming is received */
  setIncomingCall: (call: IncomingCall) => void;
  clearIncomingCall: () => void;

  /** Caller initiates a call */
  startCall: (params: {
    peerId: string;
    peerUsername: string;
    type: CallType;
    calleeId?: string;
    roomId?: string;
  }) => Promise<void>;

  /** Callee answers */
  answerCall: (callId: string) => Promise<void>;

  /** Callee declines */
  declineCall: (callId: string) => void;

  /** End the current active call */
  endCall: () => void;

  toggleMute: () => void;
  toggleVideo: () => void;

  setRemoteStream: (stream: MediaStream) => void;
  setLocalStream: (stream: MediaStream) => void;

  /** Called by useSocket when webrtc_offer arrives (callee side after answer) */
  handleOffer: (callId: string, fromUserId: string, sdp: RTCSessionDescriptionInit) => Promise<void>;
  /** Called by useSocket when webrtc_answer arrives (caller side) */
  handleAnswer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  /** Called by useSocket when webrtc_ice arrives */
  handleIce: (candidate: RTCIceCandidateInit) => Promise<void>;
}

async function buildSession(): Promise<WebRTCSession> {
  const { iceServers } = await fetchIceConfig();
  return new WebRTCSession({ iceServers });
}

export const useCallsStore = create<CallsState>((set, get) => ({
  incomingCall: null,
  activeCall: null,
  _session: null,

  setIncomingCall: (call) => set({ incomingCall: call }),
  clearIncomingCall: () => set({ incomingCall: null }),

  startCall: async ({ peerId, peerUsername, type, calleeId, roomId }) => {
    const socket = socketSingleton;
    if (!socket) return;

    const session = await buildSession();
    const localStream = await session.startLocalMedia(true, type === 'video');

    session.onRemoteStream((stream) => {
      get().setRemoteStream(stream);
    });

    session.onIceCandidate((candidate) => {
      const { activeCall } = get();
      if (activeCall) {
        socket.emit('webrtc_ice', { callId: activeCall.callId, targetUserId: peerId, candidate });
      }
    });

    // Ask server to initiate the call
    socket.emit('call_invite', { calleeId, roomId, type });

    // call_initiated is received back with the callId — store sets activeCall there
    socket.once('call_initiated', async ({ callId }: { callId: string }) => {
      set({
        _session: session,
        activeCall: {
          callId,
          type,
          peerId,
          peerUsername,
          localStream,
          remoteStream: null,
          muted: false,
          videoOff: false,
          startedAt: Date.now(),
          isCaller: true,
        },
        incomingCall: null,
      });

      // Create and send offer to callee
      const offer = await session.createOffer();
      socket.emit('webrtc_offer', { callId, targetUserId: peerId, sdp: offer });
    });
  },

  answerCall: async (callId) => {
    const socket = socketSingleton;
    const { incomingCall } = get();
    if (!socket || !incomingCall) return;

    const session = await buildSession();
    const localStream = await session.startLocalMedia(true, incomingCall.type === 'video');

    session.onRemoteStream((stream) => {
      get().setRemoteStream(stream);
    });

    session.onIceCandidate((candidate) => {
      socket.emit('webrtc_ice', {
        callId,
        targetUserId: incomingCall.callerId,
        candidate,
      });
    });

    set({
      _session: session,
      activeCall: {
        callId,
        type: incomingCall.type,
        peerId: incomingCall.callerId,
        peerUsername: incomingCall.callerUsername,
        localStream,
        remoteStream: null,
        muted: false,
        videoOff: false,
        startedAt: Date.now(),
        isCaller: false,
      },
      incomingCall: null,
    });

    socket.emit('call_answer', { callId });
  },

  declineCall: (callId) => {
    const socket = socketSingleton;
    if (socket) socket.emit('call_decline', { callId });
    set({ incomingCall: null });
  },

  endCall: () => {
    const { activeCall, _session } = get();
    const socket = socketSingleton;
    if (activeCall && socket) {
      socket.emit('call_end', { callId: activeCall.callId });
    }
    _session?.close();
    set({ activeCall: null, _session: null, incomingCall: null });
  },

  toggleMute: () => {
    const { activeCall, _session } = get();
    if (!activeCall || !_session) return;
    const newMuted = !activeCall.muted;
    _session.toggleAudio(!newMuted);
    set({ activeCall: { ...activeCall, muted: newMuted } });
  },

  toggleVideo: () => {
    const { activeCall, _session } = get();
    if (!activeCall || !_session) return;
    const newVideoOff = !activeCall.videoOff;
    _session.toggleVideo(!newVideoOff);
    set({ activeCall: { ...activeCall, videoOff: newVideoOff } });
  },

  setRemoteStream: (stream) => {
    const { activeCall } = get();
    if (!activeCall) return;
    set({ activeCall: { ...activeCall, remoteStream: stream } });
  },

  setLocalStream: (stream) => {
    const { activeCall } = get();
    if (!activeCall) return;
    set({ activeCall: { ...activeCall, localStream: stream } });
  },

  handleOffer: async (callId, fromUserId, sdp) => {
    const { _session } = get();
    const socket = socketSingleton;
    if (!_session || !socket) return;
    const answer = await _session.acceptOffer(sdp);
    socket.emit('webrtc_answer', { callId, targetUserId: fromUserId, sdp: answer });
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
}));
