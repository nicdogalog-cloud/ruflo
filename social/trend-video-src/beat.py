import numpy as np, wave
sr=44100; dur=22.3; n=int(sr*dur)
bpm=88; beat=60/bpm; bar=beat*4
out=np.zeros((n,2)); rng=np.random.default_rng(7)
def add(sig,start,ch=(1,1)):
    i=int(start*sr); j=min(n,i+len(sig))
    if i>=n: return
    out[i:j,0]+=sig[:j-i]*ch[0]; out[i:j,1]+=sig[:j-i]*ch[1]
def note(f): return 440*2**((f-69)/12)
chords=[[57,60,64,67],[53,57,60,64],[48,55,59,64],[55,59,62,64]]; bass=[45,41,48,43]
k=0;s=0.0
while s<dur:
    c=chords[k%4]; m=int(bar*sr); tt=np.arange(m)/sr
    env=np.minimum(1,tt/0.08)*np.exp(-tt*0.6)
    pad=sum(np.sin(2*np.pi*note(x)*tt+0.3*np.sin(2*np.pi*5*tt))+0.3*np.sin(4*np.pi*note(x)*tt) for x in c)
    add(0.05*pad*env,s,(0.9,1.0))
    for off,idx in [(0,3),(beat*1.5,2),(beat*2.5,1),(beat*3.5,2)]:
        t2=np.arange(int(sr))/sr
        add(0.06*np.sin(2*np.pi*note(c[idx]+12)*t2)*np.exp(-t2*4),s+off,(1.0,0.7))
    add(0.16*np.sin(2*np.pi*note(bass[k%4])*tt)*np.minimum(1,tt/0.02)*np.exp(-tt*0.9),s)
    k+=1; s+=bar
s=0.0;i=0
while s<dur:
    pos=i%8
    if s>=1.2:  # drums drop in after the hook line starts
        if pos in (0,5):
            tk=np.arange(int(0.35*sr))/sr; f=50+90*np.exp(-tk*30)
            add(0.5*np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tk*9),s)
        if pos in (2,6):
            m=int(0.25*sr); ts=np.arange(m)/sr
            add(0.16*(rng.standard_normal(m)*0.6+np.sin(2*np.pi*190*ts))*np.exp(-ts*18),s)
    m=int(0.05*sr); th=np.arange(m)/sr
    add((0.05 if i%2 else 0.03)*np.diff(rng.standard_normal(m+1))*np.exp(-th*80),s+(0.04 if i%2 else 0),(0.7,1.0))
    i+=1; s+=beat/2
cr=(rng.random(n)>0.9993)*rng.standard_normal(n)*0.15
out[:,0]+=cr; out[:,1]+=np.roll(cr,300)
for ch in range(2): out[:,ch]=np.convolve(out[:,ch],np.ones(4)/4,'same')
fade=np.ones(n); fi=int(0.4*sr); fo=int(1.8*sr)
fade[:fi]=np.linspace(0,1,fi); fade[-fo:]=np.linspace(1,0,fo)
out*=fade[:,None]; out/=np.max(np.abs(out))*1.12
w=wave.open('public/beat.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((out*32767).astype('<i2').tobytes()); w.close()
