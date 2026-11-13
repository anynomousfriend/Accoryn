/** Release only the acquired session; late cleanup must not stop its replacement. */
export function releaseCameraStream(owned: MediaStream | null, current: MediaStream | null, video: HTMLVideoElement | null): MediaStream | null {
 owned?.getTracks().forEach(track=>track.stop());
 if(owned && video?.srcObject===owned)video.srcObject=null;
 return owned===current?null:current;
}
