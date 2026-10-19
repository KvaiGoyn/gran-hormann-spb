<?php
require $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
global $USER;
if (!$USER || !$USER->IsAdmin()) {
    http_response_code(403);
    die('Доступ только для администратора сайта.');
}

function gran_setup_allowed_path($path)
{
    if ($path === 'index.php' || $path === '404.php') {
        return true;
    }
    foreach (array('bitrix/templates/gran/', 'bitrix/components/gran/', 'include/gran/', 'api/leads/', 'api/tariffs/', 'about/', 'calculator/', 'catalog/', 'contacts/', 'privacy/', 'service/') as $prefix) {
        if (strpos($path, $prefix) === 0) {
            return true;
        }
    }
    return false;
}

function gran_setup_backup_existing($zip, $documentRoot, $paths)
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('На сервере PHP не включено расширение ZipArchive. Загрузите и распакуйте пакет через файловый менеджер, затем повторно откройте этот установщик.');
    }
    $backupDirectory = $documentRoot . '/upload/gran-backups';
    if (!is_dir($backupDirectory) && !mkdir($backupDirectory, 0755, true) && !is_dir($backupDirectory)) {
        throw new RuntimeException('Не удалось создать папку резервных копий в /upload.');
    }
    $backupPath = $backupDirectory . '/gran-' . date('Ymd-His') . '.zip';
    $backup = new ZipArchive();
    if ($backup->open($backupPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('Не удалось создать резервную копию затрагиваемых файлов.');
    }
    $count = 0;
    foreach ($paths as $path) {
        $target = $documentRoot . '/' . $path;
        if (is_file($target)) {
            $backup->addFile($target, $path);
            $count++;
        }
    }
    if (!$backup->close()) {
        throw new RuntimeException('Не удалось завершить резервную копию.');
    }
    return array($backupPath, $count);
}

$message = '';
$error = '';
$archivePath = $_SERVER['DOCUMENT_ROOT'] . '/gran-bitrix-package.zip';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['install'])) {
    if (!check_bitrix_sessid()) {
        $error = 'Сессия истекла. Обновите страницу и повторите установку.';
    } elseif (!is_file($archivePath)) {
        $error = 'Не найден /gran-bitrix-package.zip. Сначала загрузите пакет в корень сайта.';
    } elseif (!class_exists('ZipArchive')) {
        $error = 'На сервере PHP не включено расширение ZipArchive. В файловом менеджере распакуйте пакет и запустите setup через ту же админскую сессию.';
    } else {
        $zip = new ZipArchive();
        if ($zip->open($archivePath) !== true) {
            $error = 'Архив не удалось открыть. Проверьте, что загрузился полный ZIP-пакет.';
        } else {
            try {
                $paths = array();
                for ($index = 0; $index < $zip->numFiles; $index++) {
                    $entry = $zip->getNameIndex($index);
                    if ($entry === false || substr($entry, -1) === '/') {
                        continue;
                    }
                    if ($entry === 'INSTALL.md') {
                        continue;
                    }
                    if (strpos($entry, '\\') !== false || strpos($entry, '/') === 0 || preg_match('#(^|/)\.\.?(/|$)#', $entry) || !gran_setup_allowed_path($entry)) {
                        throw new RuntimeException('Архив содержит недопустимый путь: ' . $entry);
                    }
                    $opsys = 0;
                    $attributes = 0;
                    if ($zip->getExternalAttributesIndex($index, $opsys, $attributes)) {
                        $fileType = ($attributes >> 16) & 0170000;
                        if ($fileType === 0120000) {
                            throw new RuntimeException('В архиве обнаружена ссылка вместо файла.');
                        }
                    }
                    $paths[] = $entry;
                }
                if (!$paths) {
                    throw new RuntimeException('Пакет не содержит файлов для установки.');
                }
                list($backupPath, $backupCount) = gran_setup_backup_existing($zip, $_SERVER['DOCUMENT_ROOT'], $paths);
                foreach ($paths as $entry) {
                    $stream = $zip->getStream($entry);
                    if (!$stream) {
                        throw new RuntimeException('Не удалось прочитать файл ' . $entry);
                    }
                    $contents = stream_get_contents($stream);
                    fclose($stream);
                    if (!is_string($contents)) {
                        throw new RuntimeException('Ошибка чтения файла ' . $entry);
                    }
                    $target = $_SERVER['DOCUMENT_ROOT'] . '/' . $entry;
                    $directory = dirname($target);
                    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
                        throw new RuntimeException('Не удалось создать каталог ' . dirname($entry));
                    }
                    $temporary = $target . '.gran-tmp';
                    if (file_put_contents($temporary, $contents, LOCK_EX) === false || !rename($temporary, $target)) {
                        @unlink($temporary);
                        throw new RuntimeException('Не удалось установить файл ' . $entry);
                    }
                }
                $zip->close();
                require_once $_SERVER['DOCUMENT_ROOT'] . '/include/gran/install.php';
                $installed = gran_install_bitrix_content();
                $message = 'Установка завершена. Созданы или проверены: ' . $installed['products'] . ' товаров, ' . $installed['pages'] . ' страниц SEO и ' . $installed['tariffRows'] . ' записей тарифов. Резервная копия затронутых файлов: /upload/gran-backups/' . basename($backupPath) . ' (' . $backupCount . ' файлов).';
            } catch (Throwable $exception) {
                $zip->close();
                $error = $exception->getMessage();
            }
        }
    }
}
?><!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Установка ГРАНЬ</title></head>
<body style="font:16px/1.5 Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#17212b">
<h1>Установка сайта ГРАНЬ</h1>
<p>Установщик проверит доступ администратора, создаст архив текущих затрагиваемых файлов в <code>/upload/gran-backups/</code>, развернёт шаблон и создаст недостающие инфоблоки. Существующие элементы с теми же символьными кодами сохраняются.</p>
<?php if ($message !== ''): ?><p style="padding:16px;background:#e7f6ed;border:1px solid #65ad7d"><?=htmlspecialcharsbx($message)?></p><?php endif; ?>
<?php if ($error !== ''): ?><p style="padding:16px;background:#fff0ef;border:1px solid #d97970"><?=htmlspecialcharsbx($error)?></p><?php endif; ?>
<p>Пакет: <strong><?=is_file($archivePath) ? 'gran-bitrix-package.zip найден' : 'не загружен в корень сайта'?></strong></p>
<form method="post">
  <?=bitrix_sessid_post()?>
  <button type="submit" name="install" value="Y" style="font:inherit;padding:12px 20px;cursor:pointer">Установить / обновить сайт</button>
</form>
<p>После проверки страниц удалите из корня <code>gran-setup.php</code> и <code>gran-bitrix-package.zip</code>. Резервную копию можно восстановить через файловый менеджер хостинга.</p>
</body>
</html>
