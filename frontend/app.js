// frontend/app.js
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/+esm";

// CONFIG
const CROWDFUNDING_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// ABI
const crowdfundingAbi = [
  "function createCampaign(string,uint,uint)",
  "function contribute(uint) payable",
  "function finalizeCampaign(uint)",
  "function getCampaign(uint) view returns (string,uint,uint,uint,address,bool)",
  "function getCampaignCount() view returns (uint)",
  "function rewardToken() view returns (address)",
  "function contributions(uint,address) view returns (uint)"
];

const rewardAbi = [
  "function balanceOf(address) view returns (uint)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// STATE
let provider;
let signer;
let user;
let crowdfunding;
let rewardToken;
let rewardDecimals = 18;
let currentFilter = "all";

// UI refs
const uiConnect = document.getElementById("uiConnect");
const uiAddress = document.getElementById("uiAddress");
const uiNetwork = document.getElementById("uiNetwork");
const uiEthBalance = document.getElementById("uiEthBalance");
const uiRwrdBalance = document.getElementById("uiRwrdBalance");
const uiRwrdAddress = document.getElementById("uiRwrdAddress");
const uiStatus = document.getElementById("uiStatus");

const uiTitle = document.getElementById("uiTitle");
const uiGoal = document.getElementById("uiGoalEth");
const uiDuration = document.getElementById("uiDurationMin");
const uiCreate = document.getElementById("uiCreate");

const uiCampaigns = document.getElementById("uiCampaigns");
const uiReload = document.getElementById("uiReload");
const uiRefresh = document.getElementById("uiRefresh");

const segBtns = document.querySelectorAll(".segBtn");
const uiSearch = document.getElementById("uiSearch");
const uiClearSearch = document.getElementById("uiClearSearch");

const uiLoadId = document.getElementById("uiLoadId");
const uiLoadBtn = document.getElementById("uiLoadBtn");

const uiCrowdfundingAddress = document.getElementById("uiCrowdfundingAddress");

// WIRES
uiConnect.onclick = connectWallet;
uiCreate.onclick = createCampaign;
uiReload.onclick = loadCampaigns;
uiRefresh.onclick = refreshBalances;
uiClearSearch.onclick = () => { uiSearch.value = ""; loadCampaigns(); };
uiLoadBtn.onclick = async () => {
  const raw = uiLoadId.value.trim();
  if (raw === "") return alert("Enter campaign ID");
  // only non-negative integers
  if (!/^\d+$/.test(raw)) {
    showStatus("Invalid campaign ID. Use a number like 0, 1, 2...", 5000);
    return;
  }

  const id = Number(raw);
  await renderCampaignById(id);
};


// seg buttons
segBtns.forEach(b => {
  b.onclick = () => {
    segBtns.forEach(sb => sb.classList.remove("active"));
    b.classList.add("active");
    currentFilter = b.dataset.filter;
    loadCampaigns();
  };
});

// search on Enter
uiSearch.addEventListener("keyup", (e) => {
  if (e.key === "Enter") loadCampaigns();
});

// HELPERS
function safeLog(...args) {
  console.log("[app]", ...args);
}

function showStatus(text, timeout = 0) {
  uiStatus.textContent = text || "";
  if (timeout > 0) setTimeout(() => { uiStatus.textContent = ""; }, timeout);
}

function formatEth(big) {
  try { return ethers.formatEther(big); }
  catch { return "0"; }
}

function formatToken(big, decimals = 18) {
  try { return ethers.formatUnits(big, decimals); }
  catch { return "0"; }
}

function parseTxError(err) {
  const msg =
    err?.shortMessage ||
    err?.reason ||
    err?.info?.error?.message ||
    err?.data?.message ||
    err?.message ||
    "";

  // normalize
  const m = String(msg);
  const low = m.toLowerCase();

  // common reverts
  if (low.includes("campaign has ended")) return "This campaign has ended. You can’t contribute anymore.";
  if (low.includes("finaliz")) return "This campaign is already finalized.";
  if (low.includes("no campaign")) return "Campaign not found.";

  // user rejected MetaMask
  if (low.includes("user rejected")) return "Transaction cancelled in MetaMask.";

  return "Transaction failed: " + m;
}

function setLockedStyle(btn, locked) {
  if (!btn) return;
  if (locked) {
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  } else {
    btn.style.opacity = "";
    btn.style.cursor = "";
  }
}

// MAIN ACTIONS
async function connectWallet() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found. Install MetaMask and try again.");
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    // request accounts
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    user = await signer.getAddress();

    // network
    const net = await provider.getNetwork();
    uiNetwork.textContent = "Network: " + net.chainId;

    if (net.chainId !== 31337n) {
      // user must switch network
      alert("Please switch MetaMask network to Hardhat Local (chainId 31337).");
      // still continue to show address
    }

    uiAddress.textContent = user;
    uiCrowdfundingAddress.textContent = "Crowdfunding: " + CROWDFUNDING_ADDRESS;

    // instantiate contracts
    crowdfunding = new ethers.Contract(CROWDFUNDING_ADDRESS, crowdfundingAbi, signer);
    const rewardAddr = await crowdfunding.rewardToken();
    uiRwrdAddress.textContent = "Token: " + rewardAddr;
    rewardToken = new ethers.Contract(rewardAddr, rewardAbi, signer);

    try {
      rewardDecimals = Number(await rewardToken.decimals());
    } catch (e) {
      rewardDecimals = 18;
    }

    // attach listeners
    if (window.ethereum && window.ethereum.on) {
      window.ethereum.on("accountsChanged", () => location.reload());
      window.ethereum.on("chainChanged", () => location.reload());
    }

    await refreshBalances();
    await loadCampaigns();

    showStatus("Connected", 3000);
  } catch (err) {
    console.error(err);
    showStatus("Connection failed: " + (err.message || err), 5000);
  }
}

async function refreshBalances() {
  try {
    if (!provider || !user) return;
    const eth = await provider.getBalance(user);
    uiEthBalance.textContent = Number(formatEth(eth)).toPrecision(6).replace(/\.?0+$/, "");
    if (rewardToken) {
      const rbal = await rewardToken.balanceOf(user);
      uiRwrdBalance.textContent = Number(formatToken(rbal, rewardDecimals)).toString();
    }
    showStatus("Balances updated", 1500);
  } catch (err) {
    console.error(err);
    showStatus("Balances update failed");
  }
}

async function createCampaign() {
  try {
    if (!crowdfunding) return alert("Connect wallet first");
    const title = uiTitle.value.trim();
    const goalStr = uiGoal.value.trim();
    const durationStr = uiDuration.value.trim();

    if (!title || !goalStr || !durationStr) {
      return alert("Fill title, goal and duration");
    }

    const goalWei = ethers.parseEther(goalStr);
    const durationSec = Math.floor(Number(durationStr) * 60);

    showStatus("Sending transaction...");
    const tx = await crowdfunding.createCampaign(title, goalWei, durationSec);
    await tx.wait();

    uiTitle.value = "";
    uiGoal.value = "";
    uiDuration.value = "";

    showStatus("Campaign created", 3000);
    await loadCampaigns();
    await refreshBalances();
  } catch (err) {
    console.error("createCampaign err:", err);
    showStatus("Error creating campaign: " + (err?.message || err), 5000);
  }
}

// load single campaign by id and render it
async function renderCampaignById(id) {
  try {
    if (!crowdfunding) return alert("Connect wallet first");
    const c = await crowdfunding.getCampaign(id);
    // reuse same renderer but for single item
    uiCampaigns.innerHTML = "";
    const parsed = await parseCampaignStruct(c, id);
    uiCampaigns.appendChild(renderCampaignCard(parsed));
  } catch (err) {
    console.error(err);
    showStatus("Load by ID failed: " + (err?.message || err), 4000);
  }
}

// helper to parse returned campaign tuple
async function parseCampaignStruct(raw, id) {
  const title = raw[0];
  const goalWei = raw[1];
  const deadlineUnix = Number(raw[2]);
  const raisedWei = raw[3];
  const creator = raw[4];
  const finalized = raw[5];

  const goalEth = Number(formatEth(goalWei));
  const raisedEth = Number(formatEth(raisedWei));

  // percent safe calculation
  const percent = (goalEth === 0 ? 0 : Math.min((raisedEth / goalEth) * 100, 100));

  // user contribution
  let yourContribution = 0;
  try {
    const contrib = await crowdfunding.contributions(id, user);
    yourContribution = Number(formatEth(contrib));
  } catch (e) {
    // ignore
  }

  return {
    id,
    title,
    goalWei,
    goalEth,
    deadlineUnix,
    raisedWei,
    raisedEth,
    percent,
    creator,
    finalized,
    yourContribution
  };
}

function renderCampaignCard(c) {
  const el = document.createElement("article");
  el.className = "camp";
  el.dataset.id = c.id;

  // readable deadline
  const deadlineStr = c.deadlineUnix ? new Date(c.deadlineUnix * 1000).toLocaleString() : "-";

  el.innerHTML = `
    <div class="campHead"><h3>#${c.id} · ${escapeHtml(c.title)}</h3></div>
    <div class="campMeta">Creator: <span class="mono">${c.creator}</span></div>
    <div class="campRow">
      <div>Goal: <strong>${c.goalEth}</strong> ETH</div>
      <div>Raised: <strong>${c.raisedEth}</strong> ETH</div>
      <div>Deadline: ${deadlineStr}</div>
      <div>Progress: ${c.percent.toFixed(2)}%</div>
      <div>Finalized: ${c.finalized}</div>
      <div>Your contribution: ${c.yourContribution} ETH</div>
    </div>
    <div style="background:#222;margin-top:8px;padding:8px;border-radius:6px;">
      <div style="background:#eee;height:10px;border-radius:6px;overflow:hidden">
        <div style="height:10px;background:#34ebd2;width:${c.percent}%"></div>
      </div>
    </div>

    <div class="campActions" style="margin-top:10px;">
      <input class="miniInput contributeInput" placeholder="amount in ETH" style="width:140px" />
      <button class="btn tiny btn-contribute">Contribute</button>
      <button class="btn tiny btn-finalize">Finalize</button>
    </div>
  `;

  const btnContribute = el.querySelector(".btn-contribute");
  const btnFinalize = el.querySelector(".btn-finalize");
  const inputContribute = el.querySelector(".contributeInput");

  // attach handlers
  btnContribute.onclick = async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    if (c.finalized) {
      showStatus("This campaign is already finalized.", 6000);
      return;
    }

    if (c.deadlineUnix && c.deadlineUnix <= nowSec) {
      showStatus("This campaign has ended. You can’t contribute anymore.", 6000);
      return;
    }

    const v = inputContribute.value.trim();
    if (!v || Number(v) <= 0) return alert("Enter amount > 0");
    await contributeToCampaign(c.id, v);
  };

  btnFinalize.onclick = async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    if (c.finalized) {
      showStatus("This campaign is already finalized.", 6000);
      return;
    }

    const isCreator = user && c.creator && (user.toLowerCase() === c.creator.toLowerCase());
    const beforeDeadline = c.deadlineUnix && nowSec < c.deadlineUnix;

    if (!isCreator && beforeDeadline) {
      showStatus("Only the creator can finalize before the deadline.", 6000);
      return;
    }

    await finalizeCampaign(c.id);
  };

  // disable buttons appropriately
  const nowSec = Math.floor(Date.now() / 1000);
  const ended = c.deadlineUnix && c.deadlineUnix <= nowSec;

  if (c.finalized) {
    setLockedStyle(btnContribute, true);
    setLockedStyle(btnFinalize, true);
    setLockedStyle(inputContribute, true);
    inputContribute.disabled = true;
  } else {
    if (ended) {
      setLockedStyle(btnContribute, true);
      setLockedStyle(inputContribute, true);
      inputContribute.disabled = true;
    }

    if (user.toLowerCase() !== c.creator.toLowerCase()) {
      setLockedStyle(btnFinalize, true);
    }
  }

  return el;
}

// escape small HTML
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function loadCampaigns() {
  try {
    if (!crowdfunding) { uiCampaigns.innerHTML = "<p>Connect wallet to load campaigns</p>"; return; }
    uiCampaigns.innerHTML = "<p>Loading campaigns...</p>";

    const countBig = await crowdfunding.getCampaignCount();
    const count = Number(countBig);

    if (count === 0) {
      uiCampaigns.innerHTML = "<p>No campaigns yet</p>";
      return;
    }

    uiCampaigns.innerHTML = "";

const search = uiSearch.value.trim().toLowerCase();
let shown = 0;

for (let i = 0; i < count; i++) {
  const raw = await crowdfunding.getCampaign(i);
  const parsed = await parseCampaignStruct(raw, i);
  // filter by segment
  const nowSec = Math.floor(Date.now() / 1000);
  let state = "active";
  if (parsed.finalized) state = "finalized";
  else if (parsed.deadlineUnix <= nowSec) state = "ended";
  if (currentFilter !== "all" && currentFilter !== state) continue;
  // search by title or creator
  if (search) {
    const hay = (parsed.title + " " + parsed.creator).toLowerCase();
    if (!hay.includes(search)) continue;
  }

  const card = renderCampaignCard(parsed);
  uiCampaigns.appendChild(card);
  shown++;
}

if (shown === 0) {
  uiCampaigns.innerHTML = "<p>No results</p>";
}

showStatus("Campaigns loaded", 1500);


    showStatus("Campaigns loaded", 1500);
  } catch (err) {
    console.error("loadCampaigns err", err);
    uiCampaigns.innerHTML = "<p>Error loading campaigns</p>";
    showStatus("Error loading campaigns: " + (err?.message || err), 5000);
  }
}

// contribute generic
async function contributeToCampaign(id, amountEth) {
  try {
    if (!crowdfunding) return alert("Connect wallet first");
    const value = ethers.parseEther(String(amountEth));
    showStatus("Sending contribution tx...");
    const tx = await crowdfunding.contribute(id, { value });
    showStatus("Waiting for confirmation...");
    await tx.wait();
    showStatus("Contribution confirmed", 3000);
    await refreshBalances();
    await loadCampaigns();
  } catch (err) {
    console.error("contribute err:", err);
    const nice = parseTxError(err);
    showStatus(nice, 6000);
  }
}


async function finalizeCampaign(id) {
  try {
    if (!crowdfunding) return alert("Connect wallet first");
    showStatus("Sending finalize tx...");
    const tx = await crowdfunding.finalizeCampaign(id);
    showStatus("Waiting for confirmation...");
    await tx.wait();
    showStatus("Campaign finalized", 3000);
    await loadCampaigns();
  } catch (err) {
    console.error("finalize err", err);
    const nice = parseTxError(err);
    showStatus(nice, 6000);
  }
}


(function init() {
  // show contract address early
  if (uiCrowdfundingAddress) uiCrowdfundingAddress.textContent = "Crowdfunding: " + CROWDFUNDING_ADDRESS;
  // no auto-connect by default
})();
