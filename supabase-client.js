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
