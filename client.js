// 리브가전 Supabase 연결 설정
// 모든 페이지에서 공통으로 이 파일을 불러와 사용합니다.
// 주의: 이 파일의 값들(URL, anon key)은 브라우저에 노출되어도 안전한 값입니다.
// 절대 여기에 service_role 키를 넣지 마세요.

const SUPABASE_URL = 'https://kobuxuhkncqmhnbrlswj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvYnV4dWhrbmNxbWhuYnJsc3dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2ODU3MjcsImV4cCI6MjEwNDI2MTcyN30.NiDlirXaQDSUVrErNXp4pglXb0UPlaOgwTXJ16Pw6Ho';

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 카테고리 URL slug <-> 실제 DB 카테고리명 매핑
// (products.html?cat=fridge 같은 링크에서 사용)
window.CATEGORY_SLUG_MAP = {
  'fridge': '냉장고',
  'fridge-kimchi': '김치냉장고',
  'laundry': '세탁/건조',
  'tv': 'TV',
  'kitchen': '주방가전',
  'living': '생활가전',
  'aircon': '에어컨',
};

// 휴대폰 번호 입력을 010-XXXX-XXXX 형식으로 자동 포맷
// 사용법: <input oninput="formatKoreanPhone(this)">
window.formatKoreanPhone = function(el){
  let digits = el.value.replace(/[^0-9]/g, '').slice(0, 11);
  let formatted = digits;
  if(digits.length > 7){
    formatted = digits.slice(0,3) + '-' + digits.slice(3,7) + '-' + digits.slice(7);
  } else if(digits.length > 3){
    formatted = digits.slice(0,3) + '-' + digits.slice(3);
  }
  el.value = formatted;
};

// 관리자 페이지 전용 가드: 로그인 + admin_users 등록 여부 확인
// 관리자가 아니면 홈으로 돌려보낸다.
window.requireAdmin = async function(){
  const { data: { user } } = await window.sb.auth.getUser();
  if(!user){
    alert('관리자 로그인이 필요합니다.');
    location.href = 'auth.html';
    return null;
  }
  const { data: adminRow } = await window.sb
    .from('admin_users')
    .select('email, role')
    .eq('email', user.email)
    .maybeSingle();

  if(!adminRow){
    alert('관리자 권한이 없는 계정입니다.');
    location.href = 'index.html';
    return null;
  }
  return { user, role: adminRow.role };
};
