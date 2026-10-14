import cv2, numpy as np
E="/mnt/project-files/crease-cam/tech/examples/"
bat=cv2.imread(E+"3-batting-front_pexels-31171122_annotated.jpg"); bowl=cv2.imread(E+"fast-bowler-delivery_annotated.jpg")
W,H=720,1280
bat=cv2.resize(bat,(W,int(bat.shape[0]*W/bat.shape[1])))[:700]
bh=360; bowl=cv2.resize(bowl,(int(bowl.shape[1]*bh/bowl.shape[0]),bh))
import sys; vw=cv2.VideoWriter(sys.argv[1] if len(sys.argv)>1 else "net.mp4",cv2.VideoWriter_fourcc(*"mp4v"),25,(W,H))
for i in range(25*24):
    t=(i%200)/25.0  # 8 s cycle: run-up 2-5s, swing at 5.5s
    f=np.full((H,W,3),(60,110,70),np.uint8)
    bx=int(W/2-bowl.shape[1]/2+ (40*np.sin(t*12) if 2<t<5 else 0))
    bx=max(0,min(W-bowl.shape[1],bx)); f[150:150+bh,bx:bx+bowl.shape[1]]=bowl
    sx=int(60*np.sin((t-5.3)*10)) if 5.3<t<5.9 else 0
    M=np.float32([[1,0,sx],[0,1,0]]); f[H-700:]=cv2.warpAffine(bat,M,(W,700),borderValue=(60,110,70))
    vw.write(f)
vw.release()
