import numpy as np, wave
sr=44100; dur=20.2; n=int(sr*dur)
bpm=100; beat=60/bpm; bar=beat*4
out=np.zeros((n,2)); rng=np.random.default_rng(3)
def add(sig,start,ch=(1,1)):
    i=int(start*sr); j=min(n,i+len(sig))
    if i>=n or j<=i: return
    out[i:j,0]+=sig[:j-i]*ch[0]; out[i:j,1]+=sig[:j-i]*ch[1]
def note(m): return 440*2**((m-69)/12)
def saw(f,t): return 2*((f*t)%1)-1
chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]; bass=[33,29,36,31]
k=0;s=0.0
while s<dur:
    c=chords[k%4]
    # offbeat stabs (punchy, modern)
    for e in range(8):
        if e%2==1:
            m=int(0.18*sr); t=np.arange(m)/sr
            st=sum(saw(note(x+12),t) for x in c)*np.exp(-t*14)
            add(0.035*st,s+e*beat/2,(0.8,1.0))
    m=int(bar*sr); t=np.arange(m)/sr
    b=np.sin(2*np.pi*note(bass[k%4]+12)*t)*np.exp(-((t%(beat))*3))
    add(0.18*b,s)
    k+=1; s+=bar
s=0.0;i=0
while s<dur:
    pos=i%8
    if s>=4.2 or s<1.5:
        if pos in (0,3,4):
            tk=np.arange(int(0.3*sr))/sr; f=45+110*np.exp(-tk*35)
            add(0.55*np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tk*10),s)
        if pos in (2,6):
            m=int(0.22*sr); ts=np.arange(m)/sr
            add(0.2*(rng.standard_normal(m)*0.7+0.5*np.sin(2*np.pi*200*ts))*np.exp(-ts*16),s)
    m=int(0.04*sr); th=np.arange(m)/sr
    add(0.04*np.diff(rng.standard_normal(m+1))*np.exp(-th*90),s,(0.6,1.0))
    i+=1; s+=beat/2
# impact hits on cuts
for tsec in [0,1.5,2.4,3.3,5.7,6.9,8.1,9.3,10.5,14.0,16.7]:
    tk=np.arange(int(0.6*sr))/sr; f=35+80*np.exp(-tk*20)
    add(0.5*np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-tk*5),tsec)
    m=int(0.35*sr); w=rng.standard_normal(m)*np.linspace(1,0,m)**2
    add(0.12*np.convolve(w,np.ones(8)/8,'same'),max(0,tsec-0.05))
# record scratch at 4.2s + riser into it
m=int(0.45*sr); t=np.arange(m)/sr
f=900*np.abs(np.sin(2*np.pi*3.3*t))+200
add(0.25*np.sign(np.sin(2*np.pi*np.cumsum(f)/sr))*np.exp(-t*3)*0.6+0.1*rng.standard_normal(m)*np.exp(-t*6),4.2)
m=int(1.2*sr); r=rng.standard_normal(m)*np.linspace(0,1,m)**2
add(0.1*np.convolve(r,np.ones(5)/5,'same'),4.5)
for ch in range(2): out[:,ch]=np.convolve(out[:,ch],np.ones(3)/3,'same')
fade=np.ones(n); fo=int(1.0*sr); fade[-fo:]=np.linspace(1,0,fo); out*=fade[:,None]
out/=np.max(np.abs(out))*1.1
w=wave.open('public/beat2.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((out*32767).astype('<i2').tobytes()); w.close()
