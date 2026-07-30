import { BOARDS as EZDAY_BOARDS, EzdayClient } from "../ezday/client.js"
import {
  BOARDS as PT_BOARDS,
  PlayTherapyClient,
} from "../playtherapy/client.js"

/**
 * 등록 대상 사이트 목록.
 *
 * 사이트마다 인증·인코딩·폼이 달라 클라이언트는 따로 두지만,
 * 본문 추출과 템플릿 적용(lib/post)은 공용이다.
 * 새 사이트를 붙일 때는 여기에 한 줄만 추가하면 된다.
 */
export const TARGETS = {
  ezday: {
    label: "이지데이",
    envId: "EZDAY_ID",
    envPw: "EZDAY_PW",
    defaultBoard: "자유톡",
    boards: EZDAY_BOARDS,
    /** 익명 체크박스를 지원하는 사이트인지 */
    supportsAnonymous: true,
    create: () => new EzdayClient(),
  },
  playtherapy: {
    label: "한국아동심리재활학회",
    envId: "PLAYTHERAPY_ID",
    envPw: "PLAYTHERAPY_PW",
    defaultBoard: "자유게시판",
    boards: PT_BOARDS,
    supportsAnonymous: false,
    create: () => new PlayTherapyClient(),
  },
}
