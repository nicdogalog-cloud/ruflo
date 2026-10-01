import soundfile as sf, numpy as np, sys
from kokoro_onnx import Kokoro
k=Kokoro("kokoro-v1.0.onnx","voices-v1.0.bin")
voice=sys.argv[1]
lines=[(0.05,1.45,"Stop filming your nets like this."),
(1.5,2.7,"Too far. Wrong angle. Thumb in the shot!"),
(4.25,1.45,"Do this instead."),
(5.75,4.7,"Crease Cam shows you exactly where to put your phone. Bowling, batting, every angle."),
(10.55,3.4,"Now you can actually see what you're doing wrong."),
(14.05,2.6,"It's free, and your videos never leave your phone."),
(16.75,3.0,"Follow Crease Cam for the launch.")]
sr=24000; out=np.zeros(int(sr*20.2))
for st,win,txt in lines:
    sp=1.15
    for _ in range(6):
        a,sr=k.create(txt,voice=voice,speed=sp,lang="en-gb")
        # trim silence
        idx=np.where(np.abs(a)>0.01)[0]; a=a[idx[0]:idx[-1]+1]
        if len(a)/sr<=win or sp>=1.6: break
        sp+=0.1
    print(f"{txt[:30]:30s} {len(a)/sr:.2f}s / {win}s speed {sp:.2f}")
    i=int(st*sr); out[i:i+len(a)]+=a[:len(out)-i]
out/=np.max(np.abs(out))*1.05
sf.write(f"vo_{voice}.wav",out,sr)
