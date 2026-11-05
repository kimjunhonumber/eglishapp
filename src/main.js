import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase.js";

// DOM 요소 참조
const loginBtn = document.getElementById("login-btn");
const welcomeLoginBtn = document.getElementById("welcome-login-btn");
const redirectLoginBtn = document.getElementById("redirect-login-btn");
const emailAuthForm = document.getElementById("email-auth-form");
const authEmailInput = document.getElementById("auth-email-input");
const authPasswordInput = document.getElementById("auth-password-input");
const emailLoginBtn = document.getElementById("email-login-btn");
const guestLoginBtn = document.getElementById("guest-login-btn");
const authStatusBox = document.getElementById("auth-status-box");

const logoutBtn = document.getElementById("logout-btn");
const userProfile = document.getElementById("user-profile");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const userEmail = document.getElementById("user-email");

const welcomeView = document.getElementById("welcome-view");
const appView = document.getElementById("app-view");

const statTotal = document.getElementById("stat-total");
const statMemorized = document.getElementById("stat-memorized");
const statLearning = document.getElementById("stat-learning");

const wordForm = document.getElementById("word-form");
const formTitle = document.getElementById("form-title");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const editWordIdInput = document.getElementById("edit-word-id");
const wordInput = document.getElementById("word-input");
const meaningInput = document.getElementById("meaning-input");
const exampleInput = document.getElementById("example-input");
const memorizedInput = document.getElementById("memorized-input");
const submitBtn = document.getElementById("submit-btn");

const wordListEl = document.getElementById("word-list");
const filterTabs = document.querySelectorAll(".tab-btn");
const searchInput = document.getElementById("search-input");
const toastEl = document.getElementById("toast");

// 애플리케이션 상태
let currentUser = null;
let unsubscribeWords = null;
let wordsData = [];
let currentFilter = "all";
let searchQuery = "";

googleProvider.setCustomParameters({
  prompt: "select_account",
});

// 화면 상단/중앙에 즉시 보이는 상태 메시지 표시
function setAuthStatus(message, isError = false) {
  if (!authStatusBox) return;
  if (!message) {
    authStatusBox.classList.add("hidden");
    authStatusBox.textContent = "";
    return;
  }
  authStatusBox.textContent = message;
  authStatusBox.classList.toggle("error", isError);
  authStatusBox.classList.remove("hidden");
}

// 토스트 메시지 표시
let toastTimer = null;
function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle("error", isError);
  toastEl.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 4500);
}

// 사용자 프로필 문서를 user/{userId} 경로에 저장
async function syncUserProfile(user) {
  try {
    await setDoc(
      doc(db, "user", user.uid),
      {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("사용자 프로필 동기화 경고:", err);
  }
}

// 이전에 리디렉션 로그인을 시작한 경우에만 getRedirectResult 호출 (팝업 락 방지)
if (sessionStorage.getItem("eglishapp_redirect_login") === "1") {
  sessionStorage.removeItem("eglishapp_redirect_login");
  setAuthStatus("Google 로그인 정보를 확인하고 있습니다...");
  getRedirectResult(auth)
    .then((result) => {
      setAuthStatus("");
      if (result && result.user) {
        showToast(`${result.user.displayName || result.user.email}님, 환영합니다!`);
      }
    })
    .catch((error) => {
      console.error("리디렉션 로그인 오류:", error);
      setAuthStatus(`Google 로그인 오류 (${error.code}): ${error.message}`, true);
    });
}

// Google 팝업 로그인
async function handleGoogleLogin() {
  setAuthStatus("⏳ Google 로그인 팝업 창을 여는 중입니다... (창이 안 뜨면 아래 '현재 창에서 Google 로그인' 또는 이메일 로그인을 이용해 주세요)");
  showToast("Google 로그인 창을 여는 중입니다...");

  try {
    const result = await signInWithPopup(auth, googleProvider);
    setAuthStatus("");
    const user = result.user;
    showToast(`${user.displayName || user.email}님, 환영합니다!`);
  } catch (error) {
    console.error("Google 로그인 오류:", error);
    if (
      error.code === "auth/popup-blocked" ||
      error.code === "auth/operation-not-supported-in-this-environment"
    ) {
      setAuthStatus("팝업이 차단되어 현재 창에서 Google 로그인 페이지로 이동합니다...");
      sessionStorage.setItem("eglishapp_redirect_login", "1");
      await signInWithRedirect(auth, googleProvider);
    } else if (
      error.code === "auth/popup-closed-by-user" ||
      error.code === "auth/cancelled-popup-request"
    ) {
      setAuthStatus(
        "팝업 창이 닫혔거나 브라우저에서 차단되었습니다. 아래 '현재 창에서 Google 로그인하기' 또는 '이메일로 로그인'을 이용해 주세요.",
        true
      );
    } else {
      setAuthStatus(`로그인 실패 (${error.code || "오류"}): ${error.message}`, true);
      showToast(`로그인 실패: ${error.message}`, true);
    }
  }
}

// 현재 창 리디렉션 방식으로 Google 로그인
async function handleRedirectLogin() {
  try {
    setAuthStatus("⏳ Google 로그인 페이지로 이동하고 있습니다...");
    sessionStorage.setItem("eglishapp_redirect_login", "1");
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error("리디렉션 시작 오류:", error);
    setAuthStatus(`리디렉션 오류 (${error.code || "error"}): ${error.message}`, true);
  }
}

// 이메일/비밀번호 로그인 (계정이 없으면 자동 회원가입 후 로그인)
async function handleEmailAuth(event) {
  event.preventDefault();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    setAuthStatus("이메일 주소와 비밀번호(6자 이상)를 입력해 주세요.", true);
    return;
  }
  if (password.length < 6) {
    setAuthStatus("비밀번호는 6자 이상이어야 합니다.", true);
    return;
  }

  emailLoginBtn.disabled = true;
  setAuthStatus("⏳ 계정 로그인 처리 중입니다...");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setAuthStatus("");
    showToast(`${email} 계정으로 로그인되었습니다!`);
  } catch (error) {
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-credential"
    ) {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        setAuthStatus("");
        showToast(`${email} 새 계정이 생성되어 로그인되었습니다!`);
      } catch (signUpError) {
        if (signUpError.code === "auth/email-already-in-use") {
          setAuthStatus("비밀번호가 일치하지 않습니다. 다시 확인해 주세요.", true);
        } else {
          setAuthStatus(`가입/로그인 실패 (${signUpError.code}): ${signUpError.message}`, true);
        }
      }
    } else {
      setAuthStatus(`로그인 실패 (${error.code}): ${error.message}`, true);
    }
  } finally {
    emailLoginBtn.disabled = false;
  }
}

// 1초 게스트(익명) 로그인
async function handleGuestLogin() {
  guestLoginBtn.disabled = true;
  setAuthStatus("⏳ 게스트 전용 단어장을 생성하고 있습니다...");
  try {
    await signInAnonymously(auth);
    setAuthStatus("");
    showToast("게스트 계정으로 로그인되었습니다!");
  } catch (error) {
    console.error("게스트 로그인 오류:", error);
    setAuthStatus(`게스트 로그인 실패 (${error.code}): ${error.message}`, true);
  } finally {
    guestLoginBtn.disabled = false;
  }
}

// 로그아웃
async function handleLogout() {
  try {
    await signOut(auth);
    resetForm();
    setAuthStatus("");
    showToast("로그아웃되었습니다.");
  } catch (error) {
    console.error("로그아웃 오류:", error);
    showToast("로그아웃 중 오류가 발생했습니다.", true);
  }
}

// 사용자별 단어 컬렉션 경로: user/{userId}/words
function getUserWordsCollection(uid) {
  return collection(db, "user", uid, "words");
}

// 실시간 단어 목록 구독
function subscribeToUserWords(uid) {
  if (unsubscribeWords) {
    unsubscribeWords();
    unsubscribeWords = null;
  }

  const wordsQuery = query(
    getUserWordsCollection(uid),
    orderBy("createdAt", "desc")
  );

  unsubscribeWords = onSnapshot(
    wordsQuery,
    (snapshot) => {
      wordsData = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      updateStats();
      renderWords();
    },
    (error) => {
      console.error("단어 목록 조회 오류:", error);
      showToast("단어 목록을 불러오는 중 권한 또는 네트워크 오류가 발생했습니다.", true);
    }
  );
}

// 통계 업데이트
function updateStats() {
  const total = wordsData.length;
  const memorizedCount = wordsData.filter((w) => w.memorized).length;
  const learningCount = total - memorizedCount;

  statTotal.textContent = String(total);
  statMemorized.textContent = String(memorizedCount);
  statLearning.textContent = String(learningCount);
}

// 단어 발음 듣기 (Web Speech API)
function speakWord(text) {
  if (!("speechSynthesis" in window)) {
    showToast("이 브라우저는 음성 합성을 지원하지 않습니다.", true);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

// 단어 목록 렌더링
function renderWords() {
  wordListEl.innerHTML = "";

  const filtered = wordsData.filter((item) => {
    if (currentFilter === "memorized" && !item.memorized) return false;
    if (currentFilter === "learning" && item.memorized) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchWord = (item.word || "").toLowerCase().includes(q);
      const matchMeaning = (item.meaning || "").toLowerCase().includes(q);
      const matchExample = (item.example || "").toLowerCase().includes(q);
      return matchWord || matchMeaning || matchExample;
    }
    return true;
  });

  if (filtered.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    emptyDiv.textContent =
      wordsData.length === 0
        ? "아직 등록된 단어가 없습니다. 왼쪽 폼에서 첫 번째 영어 단어를 추가해 보세요!"
        : "조건에 맞는 단어가 없습니다.";
    wordListEl.appendChild(emptyDiv);
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = `word-card ${item.memorized ? "is-memorized" : ""}`;

    const header = document.createElement("div");
    header.className = "word-card-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "word-title-group";

    const wordEl = document.createElement("h3");
    wordEl.className = "word-text";
    wordEl.textContent = item.word;

    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "speak-btn";
    speakBtn.title = "발음 듣기";
    speakBtn.textContent = "🔊 발음";
    speakBtn.addEventListener("click", () => speakWord(item.word));

    titleGroup.appendChild(wordEl);
    titleGroup.appendChild(speakBtn);

    const badge = document.createElement("span");
    badge.className = `badge ${
      item.memorized ? "badge-memorized" : "badge-learning"
    }`;
    badge.textContent = item.memorized ? "외움 완료" : "학습 중";

    header.appendChild(titleGroup);
    header.appendChild(badge);
    card.appendChild(header);

    const meaningEl = document.createElement("p");
    meaningEl.className = "word-meaning";
    meaningEl.textContent = item.meaning;
    card.appendChild(meaningEl);

    if (item.example && item.example.trim() !== "") {
      const exampleEl = document.createElement("p");
      exampleEl.className = "word-example";
      exampleEl.textContent = item.example;
      card.appendChild(exampleEl);
    }

    const actions = document.createElement("div");
    actions.className = "word-card-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-sm btn-toggle-memorized";
    toggleBtn.textContent = item.memorized
      ? "↩ 학습 중으로 변경"
      : "✔ 외움 완료 체크";
    toggleBtn.addEventListener("click", () => toggleMemorized(item));

    const rightGroup = document.createElement("div");
    rightGroup.className = "action-group";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-sm btn-outline";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => startEditWord(item));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-sm btn-danger-ghost";
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", () => handleDeleteWord(item));

    rightGroup.appendChild(editBtn);
    rightGroup.appendChild(deleteBtn);

    actions.appendChild(toggleBtn);
    actions.appendChild(rightGroup);
    card.appendChild(actions);

    wordListEl.appendChild(card);
  });
}

// 단어 추가 및 수정 제출 핸들러
async function handleFormSubmit(event) {
  event.preventDefault();
  if (!currentUser) {
    showToast("먼저 로그인해 주세요.", true);
    return;
  }

  const word = wordInput.value.trim();
  const meaning = meaningInput.value.trim();
  const example = exampleInput.value.trim();
  const memorized = memorizedInput.checked;
  const editId = editWordIdInput.value;

  if (!word || !meaning) {
    showToast("영어 단어와 뜻은 필수 입력 항목입니다.", true);
    return;
  }

  submitBtn.disabled = true;

  try {
    if (editId) {
      const wordRef = doc(db, "user", currentUser.uid, "words", editId);
      await updateDoc(wordRef, {
        word,
        meaning,
        example,
        memorized,
        updatedAt: serverTimestamp(),
      });
      showToast(`"${word}" 단어가 수정되었습니다.`);
      resetForm();
    } else {
      await addDoc(getUserWordsCollection(currentUser.uid), {
        word,
        meaning,
        example,
        memorized,
        uid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`"${word}" 단어가 단어장에 추가되었습니다.`);
      resetForm();
    }
  } catch (error) {
    console.error("단어 저장 오류:", error);
    showToast(`저장 실패: ${error.message}`, true);
  } finally {
    submitBtn.disabled = false;
  }
}

// 외움 여부 즉시 토글
async function toggleMemorized(item) {
  if (!currentUser) return;
  try {
    const wordRef = doc(db, "user", currentUser.uid, "words", item.id);
    await updateDoc(wordRef, {
      memorized: !item.memorized,
      updatedAt: serverTimestamp(),
    });
    showToast(
      !item.memorized
        ? `"${item.word}" 단어를 외움 완료로 표시했습니다.`
        : `"${item.word}" 단어를 학습 중으로 변경했습니다.`
    );
  } catch (error) {
    console.error("외움 상태 변경 오류:", error);
    showToast("외움 상태 변경에 실패했습니다.", true);
  }
}

// 수정 모드 진입
function startEditWord(item) {
  editWordIdInput.value = item.id;
  wordInput.value = item.word || "";
  meaningInput.value = item.meaning || "";
  exampleInput.value = item.example || "";
  memorizedInput.checked = Boolean(item.memorized);

  formTitle.textContent = "단어 수정";
  submitBtn.textContent = "수정 내용 저장";
  cancelEditBtn.classList.remove("hidden");
  wordInput.focus();
}

// 폼 초기화
function resetForm() {
  wordForm.reset();
  editWordIdInput.value = "";
  formTitle.textContent = "새 단어 추가";
  submitBtn.textContent = "단어장에 저장";
  cancelEditBtn.classList.add("hidden");
}

// 단어 삭제
async function handleDeleteWord(item) {
  if (!currentUser) return;
  const confirmed = window.confirm(
    `"${item.word}" 단어를 단어장에서 삭제할까요?`
  );
  if (!confirmed) return;

  try {
    const wordRef = doc(db, "user", currentUser.uid, "words", item.id);
    await deleteDoc(wordRef);
    if (editWordIdInput.value === item.id) {
      resetForm();
    }
    showToast(`"${item.word}" 단어가 삭제되었습니다.`);
  } catch (error) {
    console.error("단어 삭제 오류:", error);
    showToast("단어 삭제 중 오류가 발생했습니다.", true);
  }
}

// 이벤트 리스너 등록
loginBtn.addEventListener("click", handleGoogleLogin);
welcomeLoginBtn.addEventListener("click", handleGoogleLogin);
if (redirectLoginBtn) {
  redirectLoginBtn.addEventListener("click", handleRedirectLogin);
}
if (emailAuthForm) {
  emailAuthForm.addEventListener("submit", handleEmailAuth);
}
if (guestLoginBtn) {
  guestLoginBtn.addEventListener("click", handleGuestLogin);
}
logoutBtn.addEventListener("click", handleLogout);
wordForm.addEventListener("submit", handleFormSubmit);
cancelEditBtn.addEventListener("click", resetForm);

filterTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterTabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderWords();
  });
});

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderWords();
});

// 인증 상태 감시
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    setAuthStatus("");
    loginBtn.classList.add("hidden");
    userProfile.classList.remove("hidden");
    welcomeView.classList.add("hidden");
    appView.classList.remove("hidden");

    userName.textContent =
      user.displayName || (user.isAnonymous ? "게스트 사용자" : user.email?.split("@")[0] || "사용자");
    userEmail.textContent = user.email || `UID: ${user.uid.slice(0, 8)}...`;
    if (user.photoURL) {
      userAvatar.src = user.photoURL;
      userAvatar.classList.remove("hidden");
    } else {
      userAvatar.classList.add("hidden");
    }

    syncUserProfile(user);
    subscribeToUserWords(user.uid);
  } else {
    loginBtn.classList.remove("hidden");
    userProfile.classList.add("hidden");
    welcomeView.classList.remove("hidden");
    appView.classList.add("hidden");

    if (unsubscribeWords) {
      unsubscribeWords();
      unsubscribeWords = null;
    }
    wordsData = [];
    updateStats();
    renderWords();
  }
});
