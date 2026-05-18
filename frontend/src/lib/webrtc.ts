type RemoteStreamCallback = (stream: MediaStream) => void;
type IceCandidateCallback = (candidate: RTCIceCandidateInit) => void;

export class WebRTCSession {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStreamCb: RemoteStreamCallback | null = null;
  private iceCandidateCb: IceCandidateCallback | null = null;

  constructor(iceConfig: RTCConfiguration) {
    this.pc = new RTCPeerConnection(iceConfig);

    this.pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream && this.remoteStreamCb) {
        this.remoteStreamCb(remoteStream);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.iceCandidateCb) {
        this.iceCandidateCb(event.candidate.toJSON());
      }
    };
  }

  async startLocalMedia(audio: boolean, video: boolean): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    this.localStream = stream;
    stream.getTracks().forEach((track) => this.pc.addTrack(track, stream));
    return stream;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // ICE candidate errors are non-fatal — log and continue
      console.warn('[WebRTC] addIceCandidate error:', err);
    }
  }

  onRemoteStream(cb: RemoteStreamCallback): void {
    this.remoteStreamCb = cb;
  }

  onIceCandidate(cb: IceCandidateCallback): void {
    this.iceCandidateCb = cb;
  }

  toggleAudio(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  toggleVideo(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  close(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.pc.close();
  }
}
