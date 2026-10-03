package utils

import (
	"fmt"
	"math/rand/v2"
	"strings"

	"github.com/mozillazg/go-pinyin"
)

// GenerateStudentUsername 生成学生用户名：stu+姓名拼音首字母+随机数
func GenerateStudentUsername(fullName string) (string, error) {
	// 使用拼音功能，获取拼音首字母
	args := pinyin.NewArgs()
	args.Fallback = func(r rune, _ pinyin.Args) []string {
		return []string{string(r)}
	}
	args.Style = pinyin.FirstLetter

	// 获取姓名的拼音首字母
	pinyinSlice := pinyin.Pinyin(fullName, args)

	var firstLetters strings.Builder
	for _, py := range pinyinSlice {
		if len(py) > 0 {
			firstLetters.WriteString(strings.ToLower(py[0]))
		}
	}

	// 获取首字母组合
	initials := firstLetters.String()
	if initials == "" {
		initials = strings.ToLower(fullName)
	}

	// 生成4位随机数
	randNum := rand.IntN(9000) + 1000

	// 拼接用户名
	username := fmt.Sprintf("stu%s%d", initials, randNum)

	return username, nil
}
