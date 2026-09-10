# RealMeta Video-to-3D — Colab Demo

This is the fastest way to genuinely demo "upload a video → get a 3D
model" without renting or managing a GPU server. Google Colab gives
you a free, temporary GPU right in your browser.

## How to run it

1. Go to [colab.research.google.com](https://colab.research.google.com)
2. Click **File → Upload notebook**, and select
   `RealMeta_Video_to_3D_Demo.ipynb` from this folder
3. Click **Runtime → Change runtime type**, select **T4 GPU**, click **Save**
4. Run each cell from top to bottom (the ▶️ button next to each cell,
   or Shift+Enter)
5. When you reach the upload step, pick your walkthrough video
6. Wait — this genuinely takes 15–40 minutes depending on video length
7. The last cell gives you a `.ply` file to download

Take that downloaded file and load it into the RealMeta viewer webpage
using the **"Load .ply directly instead"** link, exactly like you've
been testing with the sample bonsai/garden files.

## Why this is good for a demo but not the final product

| | Colab (this notebook) | The `/backend` folder |
|---|---|---|
| Cost | Free | Costs money (GPU rental) |
| Setup | None — just a browser | Needs deployment to a real server |
| Reliability | Can occasionally be busy or disconnect | Dedicated, always-on |
| Who starts processing | You, manually, in a notebook | A visitor clicking "Upload" on the live website |
| Good for | Live demos, proving the concept works | Real customers using the product |

Showing this notebook live is a genuinely honest and impressive way
to prove "this technology really works, today" to Invest Nova Scotia
or Acadia — without needing to wait for a deployed backend server.
